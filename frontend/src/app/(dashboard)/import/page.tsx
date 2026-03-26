'use client';

import { Suspense, useEffect, useState, useCallback, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/lib/query-keys';
import { useImportHistoryQuery } from '@/features/import/hooks/useImportQueries';
import { useRouter, useSearchParams } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { useNotificationStore } from '@/store/notificationStore';
import { premiumConfirm } from '@/lib/premiumDialogs';
import {
  Upload, FileSpreadsheet, X, ArrowRight, ArrowLeft, Check,
  AlertTriangle, CheckCircle2, XCircle, Download, Clock,
  RotateCcw, ChevronDown, Eye, Trash2, FileText, Table2,
  Zap, Shield, Users, Megaphone, MapPin, Link2, Search,
  BarChart3, Info, Contact, Radio,
} from 'lucide-react';

type WizardStep = 'upload' | 'mapping' | 'options' | 'review' | 'result';

interface ModuleField {
  key: string;
  label: string;
  required: boolean;
  type: string;
  options?: string[];
}

interface PreviewData {
  fileName: string;
  fileSize: number;
  totalRows: number;
  columns: string[];
  sampleData: Record<string, string>[];
  suggestedMapping: Record<string, string>;
  moduleFields: ModuleField[];
}

interface ImportResult {
  importId: string;
  message: string;
  imported: number;
  updated: number;
  skipped: number;
  duplicates: number;
  totalRows: number;
  errors: { row: number; error: string }[];
}

interface ValidationResult {
  totalRows: number;
  validCount: number;
  errorCount: number;
  duplicateCount: number;
  skippedEstimate?: number;
  duplicateActionApplied?: string | null;
  duplicateField?: string | null;
  skippedRows?: { row: number; type: string; message: string }[];
  duplicateRows: { row: number; type: string; message: string }[];
  errors: { row: number; type: string; message: string }[];
  warnings: { row: number; type: string; message: string }[];
}

interface ImportHistoryItem {
  id: string;
  module: string;
  fileName: string;
  fileSize: number;
  totalRows: number;
  importedCount: number;
  skippedCount: number;
  updatedCount: number;
  duplicateCount: number;
  status: string;
  duplicateAction: string;
  errors: any[];
  undoneAt: string | null;
  createdAt: string;
  completedAt: string | null;
  user?: { firstName: string; lastName: string; email: string };
}

interface ManagedLeadSourceOption {
  key: string;
  label: string;
  source: string;
  isActive?: boolean;
}

const MODULES = [
  { key: 'leads', label: 'Leads', icon: Users, description: 'Import sales leads and prospects', color: 'brand' },
  { key: 'contacts', label: 'Contacts', icon: Contact, description: 'Import contacts and relationships', color: 'emerald' },
  { key: 'campaigns', label: 'Campaigns', icon: Megaphone, description: 'Import marketing campaigns', color: 'purple' },
  {
    key: 'whatsapp_broadcast',
    label: 'WhatsApp Broadcast',
    icon: Radio,
    description: 'Upload phone numbers into a named broadcast list',
    color: 'emerald',
  },
];

const EXPORT_MODULES = MODULES.filter((m) => m.key !== 'whatsapp_broadcast');

const FALLBACK_IMPORT_SOURCES: ManagedLeadSourceOption[] = [
  { key: 'WEBSITE_FORM', label: 'Website Form', source: 'WEBSITE_FORM', isActive: true },
  { key: 'LIVE_CHAT', label: 'Live Chat Widget', source: 'LIVE_CHAT', isActive: true },
  { key: 'LANDING_PAGE', label: 'Landing Page', source: 'LANDING_PAGE', isActive: true },
  { key: 'WHATSAPP', label: 'WhatsApp', source: 'WHATSAPP', isActive: true },
  { key: 'FACEBOOK_ADS', label: 'Facebook Ads', source: 'FACEBOOK_ADS', isActive: true },
  { key: 'GOOGLE_ADS', label: 'Google Ads', source: 'GOOGLE_ADS', isActive: true },
  { key: 'TIKTOK_ADS', label: 'TikTok Ads', source: 'TIKTOK_ADS', isActive: true },
  { key: 'MANUAL', label: 'Manual', source: 'MANUAL', isActive: true },
  { key: 'CSV_IMPORT', label: 'CSV Import', source: 'CSV_IMPORT', isActive: true },
  { key: 'API', label: 'API', source: 'API', isActive: true },
  { key: 'REFERRAL', label: 'Referral', source: 'REFERRAL', isActive: true },
  { key: 'EMAIL', label: 'Email', source: 'EMAIL', isActive: true },
  { key: 'PHONE', label: 'Phone', source: 'PHONE', isActive: true },
  { key: 'OTHER', label: 'Other', source: 'OTHER', isActive: true },
];

export default function ImportPage() {
  const { user } = useAuthStore();
  const isAdminOrManager = user?.role === 'ADMIN' || user?.role === 'MANAGER';
  const [tab, setTab] = useState<'import' | 'export' | 'history'>('import');

  return (
    <div className="space-y-5 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary tracking-tight">Import / Export Center</h1>
          <p className="text-text-secondary text-sm mt-0.5">
            Import and export data across your CRM
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border-subtle">
        <button
          onClick={() => setTab('import')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'import' ? 'border-brand-500 text-brand-700' : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Upload className="h-4 w-4 inline mr-2 -mt-0.5" />
          Import
        </button>
        {isAdminOrManager && (
          <button
            onClick={() => setTab('export')}
            className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === 'export' ? 'border-brand-500 text-brand-700' : 'border-transparent text-text-secondary hover:text-text-primary'
            }`}
          >
            <Download className="h-4 w-4 inline mr-2 -mt-0.5" />
            Export
          </button>
        )}
        <button
          onClick={() => setTab('history')}
          className={`px-5 py-2.5 text-sm font-medium border-b-2 transition-colors -mb-px ${
            tab === 'history' ? 'border-brand-500 text-brand-700' : 'border-transparent text-text-secondary hover:text-text-primary'
          }`}
        >
          <Clock className="h-4 w-4 inline mr-2 -mt-0.5" />
          History
        </button>
      </div>

      {tab === 'import' ? (
        <Suspense fallback={<div className="card p-8 text-center text-text-secondary text-sm">Loading import…</div>}>
          <ImportWizard />
        </Suspense>
      ) : tab === 'export' ? (
        <ExportTab />
      ) : (
        <ImportHistoryTab />
      )}
    </div>
  );
}

/* ─── Import Wizard ──────────────────────────────────────────────── */
function ImportWizard() {
  const { user } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const addToast = useNotificationStore((s) => s.addToast);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<WizardStep>('upload');
  const [selectedModule, setSelectedModule] = useState('leads');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [fieldMapping, setFieldMapping] = useState<Record<string, string>>({});
  const [duplicateAction, setDuplicateAction] = useState('skip');
  const [duplicateField, setDuplicateField] = useState('email');
  const [assignToIds, setAssignToIds] = useState<string[]>([]);
  const [defaultStatus, setDefaultStatus] = useState('');
  const [defaultSource, setDefaultSource] = useState('');
  const [ownerDropdownOpen, setOwnerDropdownOpen] = useState(false);
  const ownerDropdownRef = useRef<HTMLDivElement>(null);
  const campaignDropdownRef = useRef<HTMLDivElement>(null);
  const [campaignDropdownOpen, setCampaignDropdownOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const [users, setUsers] = useState<any[]>([]);
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [defaultCampaignIds, setDefaultCampaignIds] = useState<string[]>([]);
  const [leadSourceOptions, setLeadSourceOptions] = useState<ManagedLeadSourceOption[]>(FALLBACK_IMPORT_SOURCES);
  const [broadcastListName, setBroadcastListName] = useState('');
  const [broadcastListSlug, setBroadcastListSlug] = useState('');
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => {});
  }, []);

  useEffect(() => {
    const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
    api.getCampaigns({ page: 1, limit: 300, ...(activeDivisionId ? { divisionId: activeDivisionId } : {}) })
      .then((res: any) => {
        const rows = Array.isArray(res?.data) ? res.data : Array.isArray(res) ? res : [];
        setCampaigns(rows);
      })
      .catch(() => setCampaigns([]));
  }, []);

  useEffect(() => {
    const activeDivisionId = typeof window !== 'undefined' ? localStorage.getItem('activeDivisionId') : null;
    api.getLeadSources(activeDivisionId || undefined)
      .then((data: any) => {
        const sources = Array.isArray(data?.sources) ? data.sources : [];
        setLeadSourceOptions(sources.length > 0 ? sources : FALLBACK_IMPORT_SOURCES);
      })
      .catch(() => setLeadSourceOptions(FALLBACK_IMPORT_SOURCES));
  }, []);

  useEffect(() => {
    const m = searchParams.get('module');
    if (m === 'whatsapp_broadcast') {
      setSelectedModule('whatsapp_broadcast');
      setDuplicateField('phone');
    }
  }, [searchParams]);

  useEffect(() => {
    if (selectedModule === 'whatsapp_broadcast') {
      setDuplicateField('phone');
    }
  }, [selectedModule]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ownerDropdownRef.current && !ownerDropdownRef.current.contains(e.target as Node)) {
        setOwnerDropdownOpen(false);
      }
      if (campaignDropdownRef.current && !campaignDropdownRef.current.contains(e.target as Node)) {
        setCampaignDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOwner = (userId: string) => {
    setAssignToIds((prev) =>
      prev.includes(userId) ? prev.filter((id) => id !== userId) : [...prev, userId]
    );
  };

  const toggleDefaultCampaign = (campaignId: string) => {
    setDefaultCampaignIds((prev) =>
      prev.includes(campaignId)
        ? prev.filter((id) => id !== campaignId)
        : [...prev, campaignId]
    );
  };

  const handleFileSelect = async (selectedFile: File) => {
    setFile(selectedFile);
    setError('');
    setLoading(true);
    try {
      const data = await api.importPreview(selectedFile, selectedModule);
      setPreview(data);
      setFieldMapping(data.suggestedMapping || {});
      setStep('mapping');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  };

  const handleValidate = async () => {
    if (!file || !preview) return;
    setValidating(true);
    setValidation(null);
    try {
      const result = await api.importValidate(file, {
        module: selectedModule,
        fieldMapping,
        duplicateField: duplicateField || undefined,
      });
      setValidation(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setValidating(false);
    }
  };

  const downloadValidationRows = (
    rows: Array<{ row: number; type: string; message: string }>,
    filenamePrefix: string,
  ) => {
    if (!rows.length) return;
    const escapeCsv = (value: string | number) => {
      const str = String(value ?? '');
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };
    const csvLines = [
      ['row', 'type', 'message'].map(escapeCsv).join(','),
      ...rows.map((entry) =>
        [entry.row, entry.type, entry.message].map(escapeCsv).join(',')
      ),
    ];
    const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${filenamePrefix}-${selectedModule}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  const handleImport = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const data = await api.importExecute(file, {
        module: selectedModule,
        fieldMapping,
        duplicateAction,
        duplicateField:
          selectedModule === 'whatsapp_broadcast' ? 'phone' : duplicateField || undefined,
        assignToIds: assignToIds.length > 0 ? assignToIds : undefined,
        defaultStatus: defaultStatus || undefined,
        defaultSource: defaultSource || undefined,
        defaultCampaignIds: selectedModule === 'leads' && defaultCampaignIds.length > 0 ? defaultCampaignIds : undefined,
        broadcastListName: selectedModule === 'whatsapp_broadcast' ? broadcastListName.trim() : undefined,
        broadcastListSlug: selectedModule === 'whatsapp_broadcast' ? broadcastListSlug.trim() : undefined,
      });
      setResult(data);
      setStep('result');
      addToast({ type: 'success', title: 'Import complete', message: `${data.imported} records imported successfully` });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    setStep('upload');
    setFile(null);
    setPreview(null);
    setFieldMapping({});
    setResult(null);
    setValidation(null);
    setError('');
    setDuplicateAction('skip');
    setDuplicateField('email');
    setAssignToIds([]);
    setDefaultCampaignIds([]);
    setDefaultStatus('');
    setDefaultSource('');
    setBroadcastListName('');
    setBroadcastListSlug('');
  };

  const steps: { key: WizardStep; label: string; num: number }[] = [
    { key: 'upload', label: 'Upload File', num: 1 },
    { key: 'mapping', label: 'Map Fields', num: 2 },
    { key: 'options', label: 'Options', num: 3 },
    { key: 'review', label: 'Review & Import', num: 4 },
    { key: 'result', label: 'Results', num: 5 },
  ];

  const stepIndex = steps.findIndex(s => s.key === step);

  // Count mapped required fields
  const mappedRequiredCount = preview?.moduleFields.filter(f => f.required && Object.values(fieldMapping).includes(f.key)).length || 0;
  const totalRequiredCount = preview?.moduleFields.filter(f => f.required).length || 0;
  const allRequiredMapped = mappedRequiredCount === totalRequiredCount;

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="card p-4">
        <div className="flex items-center justify-between">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center flex-1 last:flex-none">
              <div className="flex items-center gap-2">
                <div className={`h-8 w-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors ${
                  i < stepIndex ? 'bg-emerald-500 text-white' :
                  i === stepIndex ? 'bg-brand-500 text-white' :
                  'bg-gray-100 text-text-tertiary'
                }`}>
                  {i < stepIndex ? <Check className="h-4 w-4" /> : s.num}
                </div>
                <span className={`text-sm font-medium hidden sm:block ${
                  i <= stepIndex ? 'text-text-primary' : 'text-text-tertiary'
                }`}>{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-3 rounded ${
                  i < stepIndex ? 'bg-emerald-500' : 'bg-gray-100'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step Content */}
      {step === 'upload' && (
        <div className="space-y-6">
          {/* Module Selection */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Select Module</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {MODULES.map((mod) => {
                const Icon = mod.icon;
                return (
                  <button
                    key={mod.key}
                    onClick={() => {
                      setSelectedModule(mod.key);
                      if (mod.key === 'whatsapp_broadcast') setDuplicateField('phone');
                    }}
                    className={`p-4 rounded-lg border text-left transition-all duration-150 ${
                      selectedModule === mod.key
                        ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                        : 'border-border hover:border-border-strong hover:bg-surface-secondary'
                    }`}
                  >
                    <Icon className={`h-5 w-5 mb-2 ${selectedModule === mod.key ? 'text-brand-600' : 'text-text-tertiary'}`} />
                    <p className={`text-sm font-semibold ${selectedModule === mod.key ? 'text-brand-700' : 'text-text-primary'}`}>{mod.label}</p>
                    <p className="text-2xs text-text-tertiary mt-0.5">{mod.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* File Upload */}
          <div className="card p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-text-primary">Upload File</h3>
              <button
                onClick={() => api.downloadImportTemplate(selectedModule).catch((err: any) => addToast({ type: 'error', title: 'Template download failed', message: err.message }))}
                className="text-sm text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
              >
                <Download className="h-3.5 w-3.5" />
                Download Template
              </button>
            </div>

            <div
              onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-all duration-200 ${
                dragOver ? 'border-brand-500 bg-brand-50' :
                'border-border hover:border-brand-300 hover:bg-surface-secondary'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept=".csv,.tsv,.xlsx,.xls"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) handleFileSelect(f);
                }}
              />
              <div className="flex flex-col items-center">
                <div className={`h-14 w-14 rounded-2xl flex items-center justify-center mb-4 ${
                  dragOver ? 'bg-brand-100' : 'bg-gray-100'
                }`}>
                  <Upload className={`h-6 w-6 ${dragOver ? 'text-brand-600' : 'text-text-tertiary'}`} />
                </div>
                <p className="text-sm font-semibold text-text-primary mb-1">
                  {loading ? 'Processing file...' : 'Drop your file here or click to browse'}
                </p>
                <p className="text-2xs text-text-tertiary">
                  Supports CSV, TSV, XLS, XLSX &middot; Max 25MB
                </p>
              </div>
            </div>

            {error && (
              <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700 ring-1 ring-red-200">
                <AlertTriangle className="h-4 w-4 flex-shrink-0" />
                {error}
              </div>
            )}
          </div>

          {/* Format Info */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Supported Formats</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { ext: '.CSV', desc: 'Comma-separated values', icon: FileText },
                { ext: '.TSV', desc: 'Tab-separated values', icon: FileText },
                { ext: '.XLSX', desc: 'Modern Excel format', icon: FileSpreadsheet },
                { ext: '.XLS', desc: 'Legacy Excel format', icon: FileSpreadsheet },
              ].map((fmt) => (
                <div key={fmt.ext} className="flex items-center gap-3 p-3 rounded-lg bg-surface-secondary">
                  <fmt.icon className="h-5 w-5 text-text-tertiary flex-shrink-0" />
                  <div>
                    <p className="text-sm font-semibold text-text-primary">{fmt.ext}</p>
                    <p className="text-2xs text-text-tertiary">{fmt.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {step === 'mapping' && preview && (
        <div className="space-y-6">
          {/* File Info */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center">
                  <FileSpreadsheet className="h-5 w-5 text-brand-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-text-primary">{preview.fileName}</p>
                  <p className="text-2xs text-text-tertiary">
                    {preview.totalRows} rows &middot; {(preview.fileSize / 1024).toFixed(1)} KB &middot; {preview.columns.length} columns
                  </p>
                </div>
              </div>
              <button onClick={handleReset} className="btn-secondary text-sm">
                <X className="h-3.5 w-3.5" /> Change File
              </button>
            </div>
          </div>

          {/* Mapping Status */}
          <div className={`p-3 rounded-lg flex items-center gap-2 ${
            allRequiredMapped ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'bg-amber-50 ring-1 ring-amber-200'
          }`}>
            {allRequiredMapped ? (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
            )}
            <p className={`text-sm ${allRequiredMapped ? 'text-emerald-800' : 'text-amber-800'}`}>
              {mappedRequiredCount}/{totalRequiredCount} required fields mapped
              {allRequiredMapped && ' — Ready to proceed'}
            </p>
          </div>

          {/* Field Mapping Table */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-border-subtle bg-surface-secondary">
              <h3 className="text-sm font-semibold text-text-primary">Map Your Columns to CRM Fields</h3>
              <p className="text-2xs text-text-tertiary mt-0.5">We auto-detected some mappings. Adjust as needed.</p>
            </div>
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="table-cell text-left">File Column</th>
                  <th className="table-cell text-left">Sample Data</th>
                  <th className="table-cell text-center w-10"></th>
                  <th className="table-cell text-left">CRM Field</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {preview.columns.map((col) => (
                  <tr key={col} className="table-row">
                    <td className="table-cell">
                      <span className="text-sm font-medium text-text-primary">{col}</span>
                    </td>
                    <td className="table-cell">
                      <span className="text-2xs text-text-tertiary font-mono truncate block max-w-[200px]">
                        {preview.sampleData[0]?.[col] || '—'}
                      </span>
                    </td>
                    <td className="table-cell text-center">
                      <ArrowRight className="h-4 w-4 text-text-tertiary mx-auto" />
                    </td>
                    <td className="table-cell">
                      <select
                        value={fieldMapping[col] || ''}
                        onChange={(e) => setFieldMapping({ ...fieldMapping, [col]: e.target.value })}
                        className="input text-sm py-1.5"
                      >
                        <option value="">— Skip this column —</option>
                        {preview.moduleFields.map((f) => (
                          <option key={f.key} value={f.key}>
                            {f.label}{f.required ? ' *' : ''}
                          </option>
                        ))}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Sample Data Preview */}
          <div className="card overflow-hidden">
            <div className="px-5 py-3 border-b border-border-subtle bg-surface-secondary">
              <h3 className="text-sm font-semibold text-text-primary">Data Preview (First 5 Rows)</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="table-header">
                    <th className="table-cell text-center w-10">#</th>
                    {preview.columns.map((col) => (
                      <th key={col} className="table-cell text-left whitespace-nowrap">
                        <span className="text-2xs">{col}</span>
                        {fieldMapping[col] && (
                          <span className="text-2xs text-brand-600 block">→ {fieldMapping[col]}</span>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border-subtle">
                  {preview.sampleData.map((row, i) => (
                    <tr key={i} className="table-row">
                      <td className="table-cell text-center text-2xs text-text-tertiary">{i + 1}</td>
                      {preview.columns.map((col) => (
                        <td key={col} className="table-cell text-2xs text-text-secondary whitespace-nowrap max-w-[150px] truncate">
                          {row[col] || '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Navigation */}
          <div className="flex justify-between">
            <button onClick={handleReset} className="btn-secondary">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button
              onClick={() => setStep('options')}
              disabled={!allRequiredMapped}
              className="btn-primary"
            >
              Next: Options <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {step === 'options' && preview && (
        <div className="space-y-6">
          {selectedModule === 'whatsapp_broadcast' && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-text-primary mb-1">Broadcast list</h3>
              <p className="text-2xs text-text-tertiary mb-4">
                This list appears under <strong className="font-medium text-text-secondary">Broadcast lists</strong>. Use a clear name; optional slug must be unique per division if set.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="label">List name *</label>
                  <input
                    className="input"
                    value={broadcastListName}
                    onChange={(e) => setBroadcastListName(e.target.value)}
                    placeholder="e.g. Valentine promo — Dubai"
                  />
                </div>
                <div>
                  <label className="label">List slug / external ID (optional)</label>
                  <input
                    className="input font-mono text-sm"
                    value={broadcastListSlug}
                    onChange={(e) => setBroadcastListSlug(e.target.value)}
                    placeholder="e.g. valentine_dubai_2026"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Duplicate Handling */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-text-primary mb-1">Duplicate Handling</h3>
            <p className="text-2xs text-text-tertiary mb-4">
              {selectedModule === 'whatsapp_broadcast'
                ? 'Phone numbers are normalized (digits). Duplicates within the file are skipped. For re-imports to the same list, choose whether to skip or update existing members by phone.'
                : 'Choose how to handle records that already exist in your CRM'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="label">Check duplicates by</label>
                <select
                  value={selectedModule === 'whatsapp_broadcast' ? 'phone' : duplicateField}
                  onChange={(e) => setDuplicateField(e.target.value)}
                  disabled={selectedModule === 'whatsapp_broadcast'}
                  className="input max-w-xs"
                >
                  {selectedModule === 'whatsapp_broadcast' ? (
                    <option value="phone">Phone (required for broadcast lists)</option>
                  ) : (
                    <>
                      <option value="">Don&apos;t check for duplicates</option>
                      <option value="email">Email</option>
                      <option value="phone">Phone</option>
                      {selectedModule === 'contacts' && <option value="mobile">Mobile</option>}
                    </>
                  )}
                </select>
              </div>

              {duplicateField && (
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { key: 'skip', label: 'Skip Duplicates', desc: 'Keep existing records, ignore new ones', icon: Shield },
                    { key: 'overwrite', label: 'Overwrite', desc: 'Update existing records with new data', icon: RotateCcw },
                    { key: 'clone', label: 'Create Anyway', desc: 'Create new records even if duplicates exist', icon: FileText },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setDuplicateAction(opt.key)}
                      className={`p-4 rounded-lg border text-left transition-all duration-150 ${
                        duplicateAction === opt.key
                          ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                          : 'border-border hover:border-border-strong hover:bg-surface-secondary'
                      }`}
                    >
                      <opt.icon className={`h-4 w-4 mb-2 ${duplicateAction === opt.key ? 'text-brand-600' : 'text-text-tertiary'}`} />
                      <p className={`text-sm font-semibold ${duplicateAction === opt.key ? 'text-brand-700' : 'text-text-primary'}`}>{opt.label}</p>
                      <p className="text-2xs text-text-tertiary mt-0.5">{opt.desc}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Default Values — Leads */}
          {selectedModule === 'leads' && (
            <div className="card p-6 overflow-visible">
              <h3 className="text-sm font-semibold text-text-primary mb-1">Default Values</h3>
              <p className="text-2xs text-text-tertiary mb-4">Set defaults for fields not present in your file</p>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="label">Assign To <span className="text-2xs text-gray-400 font-normal">(multi-select)</span></label>
                  <div ref={ownerDropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setOwnerDropdownOpen(!ownerDropdownOpen)}
                      className="input w-full text-left flex items-center justify-between"
                    >
                      <span className={assignToIds.length === 0 ? 'text-text-tertiary' : 'text-text-primary'}>
                        {assignToIds.length === 0
                          ? 'No assignment'
                          : assignToIds.length === 1
                            ? users.find((u: any) => u.id === assignToIds[0])
                              ? `${users.find((u: any) => u.id === assignToIds[0]).firstName} ${users.find((u: any) => u.id === assignToIds[0]).lastName}`
                              : '1 selected'
                            : `${assignToIds.length} owners selected`}
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 text-text-tertiary transition-transform ${ownerDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {ownerDropdownOpen && (
                      <div className="absolute z-50 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                        {assignToIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setAssignToIds([])}
                            className="w-full px-3 py-1.5 text-left text-2xs text-red-500 hover:bg-red-50 border-b border-gray-100"
                          >
                            Clear all
                          </button>
                        )}
                        {users.map((u: any) => {
                          const isSelected = assignToIds.includes(u.id);
                          return (
                            <label
                              key={u.id}
                              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleOwner(u.id)}
                                className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="text-sm text-text-primary">{u.firstName} {u.lastName}</span>
                            </label>
                          );
                        })}
                        {users.length === 0 && (
                          <p className="px-3 py-2 text-2xs text-text-tertiary">No team members found</p>
                        )}
                      </div>
                    )}
                  </div>
                  {assignToIds.length > 1 && (
                    <p className="text-2xs text-brand-600 mt-1">Leads will be distributed round-robin among selected owners</p>
                  )}
                </div>
                <div>
                  <label className="label">Default Status</label>
                  <select value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value)} className="input">
                    <option value="">NEW (default)</option>
                    <option value="CONTACTED">Contacted</option>
                    <option value="QUALIFIED">Qualified</option>
                  </select>
                </div>
                <div>
                  <label className="label">Default Source</label>
                  <select value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)} className="input">
                    <option value="">CSV Import (default)</option>
                    {leadSourceOptions.map((src) => (
                      <option key={src.key} value={src.key}>
                        {src.label}{src.isActive === false ? ' (Inactive)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-1">
                  <label className="label">Attach Offer Campaigns <span className="text-2xs text-gray-400 font-normal">(multi-select)</span></label>
                  <div ref={campaignDropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setCampaignDropdownOpen(!campaignDropdownOpen)}
                      className="input w-full text-left flex items-center justify-between"
                    >
                      <span className={defaultCampaignIds.length === 0 ? 'text-text-tertiary' : 'text-text-primary'}>
                        {defaultCampaignIds.length === 0
                          ? 'No campaigns selected'
                          : defaultCampaignIds.length === 1
                            ? (campaigns.find((c: any) => c.id === defaultCampaignIds[0])?.name || '1 selected')
                            : `${defaultCampaignIds.length} campaigns selected`}
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 text-text-tertiary transition-transform ${campaignDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {campaignDropdownOpen && (
                      <div className="absolute z-50 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
                        {defaultCampaignIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setDefaultCampaignIds([])}
                            className="w-full px-3 py-1.5 text-left text-2xs text-red-500 hover:bg-red-50 border-b border-gray-100"
                          >
                            Clear all
                          </button>
                        )}
                        {campaigns.map((c: any) => {
                          const isSelected = defaultCampaignIds.includes(c.id);
                          return (
                            <label key={c.id} className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleDefaultCampaign(c.id)}
                                className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="text-sm text-text-primary truncate">
                                {c.name}
                              </span>
                            </label>
                          );
                        })}
                        {campaigns.length === 0 && (
                          <p className="px-3 py-2 text-2xs text-text-tertiary">No campaigns found</p>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="text-2xs text-text-tertiary mt-1">
                    Selected campaigns will be attached as offers to imported leads.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Default Values — Contacts */}
          {selectedModule === 'contacts' && (
            <div className="card p-6 overflow-visible">
              <h3 className="text-sm font-semibold text-text-primary mb-1">Default Values</h3>
              <p className="text-2xs text-text-tertiary mb-4">Set defaults for fields not present in your file</p>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="label">Owner <span className="text-2xs text-gray-400 font-normal">(multi-select)</span></label>
                  <div ref={ownerDropdownRef} className="relative">
                    <button
                      type="button"
                      onClick={() => setOwnerDropdownOpen(!ownerDropdownOpen)}
                      className="input w-full text-left flex items-center justify-between"
                    >
                      <span className={assignToIds.length === 0 ? 'text-text-tertiary' : 'text-text-primary'}>
                        {assignToIds.length === 0
                          ? 'No owner'
                          : assignToIds.length === 1
                            ? users.find((u: any) => u.id === assignToIds[0])
                              ? `${users.find((u: any) => u.id === assignToIds[0]).firstName} ${users.find((u: any) => u.id === assignToIds[0]).lastName}`
                              : '1 selected'
                            : `${assignToIds.length} owners selected`}
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 text-text-tertiary transition-transform ${ownerDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>
                    {ownerDropdownOpen && (
                      <div className="absolute z-50 bottom-full mb-1 w-full bg-white border border-gray-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                        {assignToIds.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setAssignToIds([])}
                            className="w-full px-3 py-1.5 text-left text-2xs text-red-500 hover:bg-red-50 border-b border-gray-100"
                          >
                            Clear all
                          </button>
                        )}
                        {users.map((u: any) => {
                          const isSelected = assignToIds.includes(u.id);
                          return (
                            <label
                              key={u.id}
                              className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50"
                            >
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => toggleOwner(u.id)}
                                className="h-3.5 w-3.5 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                              />
                              <span className="text-sm text-text-primary">{u.firstName} {u.lastName}</span>
                            </label>
                          );
                        })}
                        {users.length === 0 && (
                          <p className="px-3 py-2 text-2xs text-text-tertiary">No team members found</p>
                        )}
                      </div>
                    )}
                  </div>
                  {assignToIds.length > 1 && (
                    <p className="text-2xs text-brand-600 mt-1">Contacts will be distributed round-robin among selected owners</p>
                  )}
                </div>
                <div>
                  <label className="label">Default Lifecycle</label>
                  <select value={defaultStatus} onChange={(e) => setDefaultStatus(e.target.value)} className="input">
                    <option value="">Subscriber (default)</option>
                    <option value="LEAD">Lead</option>
                    <option value="MARKETING_QUALIFIED">Marketing Qualified</option>
                    <option value="SALES_QUALIFIED">Sales Qualified</option>
                    <option value="OPPORTUNITY">Opportunity</option>
                    <option value="CUSTOMER">Customer</option>
                    <option value="EVANGELIST">Evangelist</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>
                <div>
                  <label className="label">Default Source</label>
                  <select value={defaultSource} onChange={(e) => setDefaultSource(e.target.value)} className="input">
                    <option value="">CSV Import (default)</option>
                    {leadSourceOptions.map((src) => (
                      <option key={src.key} value={src.key}>
                        {src.label}{src.isActive === false ? ' (Inactive)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between">
            <button onClick={() => setStep('mapping')} className="btn-secondary">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button
              onClick={() => {
                if (selectedModule === 'whatsapp_broadcast' && !broadcastListName.trim()) {
                  setError('Enter a broadcast list name.');
                  return;
                }
                setError('');
                setStep('review');
                handleValidate();
              }}
              className="btn-primary"
            >
              Next: Review <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {step === 'review' && preview && (
        <div className="space-y-6">
          {/* Import Summary */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-text-primary mb-4">Import Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-lg bg-surface-secondary">
                <p className="text-2xs text-text-tertiary">Module</p>
                <p className="text-sm font-semibold text-text-primary capitalize mt-1">{selectedModule}</p>
              </div>
              <div className="p-4 rounded-lg bg-surface-secondary">
                <p className="text-2xs text-text-tertiary">Total Rows</p>
                <p className="text-sm font-semibold text-text-primary mt-1">{preview.totalRows}</p>
              </div>
              <div className="p-4 rounded-lg bg-surface-secondary">
                <p className="text-2xs text-text-tertiary">Mapped Fields</p>
                <p className="text-sm font-semibold text-text-primary mt-1">{Object.values(fieldMapping).filter(Boolean).length}</p>
              </div>
              <div className="p-4 rounded-lg bg-surface-secondary">
                <p className="text-2xs text-text-tertiary">Duplicate Action</p>
                <p className="text-sm font-semibold text-text-primary mt-1 capitalize">
                  {selectedModule === 'whatsapp_broadcast'
                    ? `${duplicateAction} (phone)`
                    : duplicateField
                      ? duplicateAction
                      : 'None'}
                </p>
              </div>
            </div>
            {selectedModule === 'whatsapp_broadcast' && (
              <div className="mt-4 p-4 rounded-lg bg-brand-50 ring-1 ring-brand-100">
                <p className="text-2xs text-text-tertiary">Broadcast list name</p>
                <p className="text-sm font-semibold text-text-primary">{broadcastListName || '—'}</p>
                {broadcastListSlug.trim() ? (
                  <p className="text-2xs text-text-tertiary mt-1">Slug: {broadcastListSlug.trim()}</p>
                ) : null}
              </div>
            )}
          </div>

          {/* Mapped Fields */}
          <div className="card p-6">
            <h3 className="text-sm font-semibold text-text-primary mb-3">Field Mapping</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
              {Object.entries(fieldMapping).filter(([_, v]) => v).map(([csvCol, crmField]) => {
                const field = preview.moduleFields.find(f => f.key === crmField);
                return (
                  <div key={csvCol} className="flex items-center gap-2 p-2 rounded-lg bg-surface-secondary text-sm">
                    <span className="text-text-secondary truncate">{csvCol}</span>
                    <ArrowRight className="h-3 w-3 text-text-tertiary flex-shrink-0" />
                    <span className="text-text-primary font-medium truncate">{field?.label || crmField}</span>
                    {field?.required && <span className="text-red-500 text-2xs">*</span>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Validation Results */}
          {validating && (
            <div className="card p-6 text-center">
              <div className="h-10 w-10 rounded-lg bg-brand-50 flex items-center justify-center mx-auto mb-3 animate-pulse">
                <Search className="h-5 w-5 text-brand-500" />
              </div>
              <p className="text-sm font-semibold text-text-primary">Validating your data...</p>
              <p className="text-2xs text-text-tertiary mt-1">Checking for errors and duplicates</p>
            </div>
          )}

          {validation && (
            <div className="card p-6">
              <h3 className="text-sm font-semibold text-text-primary mb-4">Validation Results</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                <div className="p-3 rounded-lg bg-emerald-50 ring-1 ring-emerald-200">
                  <p className="text-2xs text-emerald-600">Valid Rows</p>
                  <p className="text-lg font-bold text-emerald-700">{validation.validCount}</p>
                </div>
                <div className={`p-3 rounded-lg ${validation.errorCount > 0 ? 'bg-red-50 ring-1 ring-red-200' : 'bg-gray-50 ring-1 ring-gray-200'}`}>
                  <p className={`text-2xs ${validation.errorCount > 0 ? 'text-red-600' : 'text-text-tertiary'}`}>Errors</p>
                  <p className={`text-lg font-bold ${validation.errorCount > 0 ? 'text-red-700' : 'text-text-tertiary'}`}>{validation.errorCount}</p>
                </div>
                <div className={`p-3 rounded-lg ${validation.duplicateCount > 0 ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-gray-50 ring-1 ring-gray-200'}`}>
                  <p className={`text-2xs ${validation.duplicateCount > 0 ? 'text-amber-600' : 'text-text-tertiary'}`}>Duplicates</p>
                  <p className={`text-lg font-bold ${validation.duplicateCount > 0 ? 'text-amber-700' : 'text-text-tertiary'}`}>{validation.duplicateCount}</p>
                </div>
                <div className="p-3 rounded-lg bg-gray-50 ring-1 ring-gray-200">
                  <p className="text-2xs text-text-tertiary">Total Rows</p>
                  <p className="text-lg font-bold text-text-primary">{validation.totalRows}</p>
                </div>
                <div className={`p-3 rounded-lg ${(validation.skippedEstimate || 0) > 0 ? 'bg-rose-50 ring-1 ring-rose-200' : 'bg-gray-50 ring-1 ring-gray-200'}`}>
                  <p className={`text-2xs ${(validation.skippedEstimate || 0) > 0 ? 'text-rose-600' : 'text-text-tertiary'}`}>Estimated Skipped</p>
                  <p className={`text-lg font-bold ${(validation.skippedEstimate || 0) > 0 ? 'text-rose-700' : 'text-text-tertiary'}`}>{validation.skippedEstimate || 0}</p>
                </div>
              </div>

              {(validation.duplicateRows?.length || 0) > 0 && (
                <div className="mb-4 p-3 rounded-lg bg-amber-50 ring-1 ring-amber-200">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Duplicate Rows Preview</p>
                      <p className="text-2xs text-amber-700">
                        Found {(validation.duplicateRows || []).length} duplicate rows
                        {validation.duplicateField ? ` by ${validation.duplicateField}` : ''}.
                        {validation.duplicateActionApplied === 'skip' ? ' These rows will be skipped.' : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => downloadValidationRows(validation.duplicateRows || [], 'duplicate-rows')}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download Duplicates CSV
                    </button>
                  </div>
                  <div className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                    {(validation.duplicateRows || []).slice(0, 20).map((dup, i) => (
                      <div key={i} className="flex items-start gap-2 p-2 rounded bg-amber-100/70 text-2xs text-amber-800">
                        <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                        <span>Row {dup.row}: {dup.message}</span>
                      </div>
                    ))}
                    {(validation.duplicateRows || []).length > 20 && (
                      <p className="text-2xs text-amber-700 text-center py-1">
                        ... and {(validation.duplicateRows || []).length - 20} more duplicates
                      </p>
                    )}
                  </div>
                </div>
              )}

              {validation.errors.length > 0 && (
                <div className="space-y-1 max-h-40 overflow-y-auto">
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => downloadValidationRows(validation.errors || [], 'validation-errors')}
                    >
                      <Download className="h-3.5 w-3.5" />
                      Download Errors CSV
                    </button>
                  </div>
                  {validation.errors.slice(0, 20).map((err, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded bg-red-50 text-2xs text-red-700">
                      <XCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                      <span>Row {err.row}: {err.message}</span>
                    </div>
                  ))}
                  {validation.errors.length > 20 && (
                    <p className="text-2xs text-text-tertiary text-center py-1">
                      ... and {validation.errors.length - 20} more errors
                    </p>
                  )}
                </div>
              )}

              {validation.warnings.length > 0 && (
                <div className="space-y-1 max-h-32 overflow-y-auto mt-3">
                  {validation.warnings.slice(0, 10).map((warn, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 rounded bg-amber-50 text-2xs text-amber-700">
                      <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                      <span>Row {warn.row}: {warn.message}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 text-sm text-red-700 ring-1 ring-red-200">
              <AlertTriangle className="h-4 w-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between">
            <button onClick={() => setStep('options')} className="btn-secondary">
              <ArrowLeft className="h-3.5 w-3.5" /> Back
            </button>
            <button
              onClick={handleImport}
              disabled={loading}
              className="btn-primary"
            >
              {loading ? (
                <>Importing...</>
              ) : (
                <>
                  <Zap className="h-3.5 w-3.5" />
                  Import {preview.totalRows} Records
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-6">
          {/* Success Card */}
          <div className="card p-8 text-center">
            <div className="h-16 w-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h2 className="text-xl font-bold text-text-primary mb-1">Import Complete!</h2>
            <p className="text-sm text-text-secondary">{result.message}</p>
          </div>

          {/* Stats */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-text-primary">{result.totalRows}</p>
              <p className="text-2xs text-text-tertiary mt-1">Total Rows</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-emerald-600">{result.imported}</p>
              <p className="text-2xs text-text-tertiary mt-1">Imported</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-blue-600">{result.updated}</p>
              <p className="text-2xs text-text-tertiary mt-1">Updated</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-amber-600">{result.duplicates}</p>
              <p className="text-2xs text-text-tertiary mt-1">Duplicates</p>
            </div>
            <div className="card p-4 text-center">
              <p className="text-2xl font-bold text-red-600">{result.skipped}</p>
              <p className="text-2xs text-text-tertiary mt-1">Skipped</p>
            </div>
          </div>

          {/* Errors */}
          {result.errors.length > 0 && (
            <div className="card p-5">
              <h3 className="text-sm font-semibold text-text-primary mb-3">Import Errors ({result.errors.length})</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {result.errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-red-50 text-2xs text-red-700">
                    <XCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    <span>Row {err.row}: {err.error}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-center gap-3">
            <button onClick={handleReset} className="btn-primary">
              <Upload className="h-3.5 w-3.5" />
              Import More Data
            </button>
            <button
              onClick={() => {
                if (selectedModule === 'whatsapp_broadcast') router.push('/broadcast-lists');
                else router.push(`/${selectedModule}`);
              }}
              className="btn-secondary"
            >
              {selectedModule === 'whatsapp_broadcast'
                ? 'Open broadcast lists'
                : `View ${selectedModule === 'leads' ? 'Leads' : selectedModule === 'contacts' ? 'Contacts' : 'Campaigns'}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Export Tab ─────────────────────────────────────────────────── */
function ExportTab() {
  const addToast = useNotificationStore((s) => s.addToast);
  const [exportModule, setExportModule] = useState('leads');
  const [exporting, setExporting] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [users, setUsers] = useState<any[]>([]);

  useEffect(() => {
    api.getUsers().then(setUsers).catch(() => {});
  }, []);

  const handleExport = async () => {
    setExporting(true);
    try {
      await api.exportData(exportModule, filters);
      addToast({ type: 'success', title: 'Export complete', message: `${exportModule} data exported successfully` });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Export failed', message: err.message });
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Module Selection */}
      <div className="card p-6">
        <h3 className="text-sm font-semibold text-text-primary mb-4">Select Module to Export</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {EXPORT_MODULES.map((mod) => {
            const Icon = mod.icon;
            return (
              <button
                key={mod.key}
                onClick={() => { setExportModule(mod.key); setFilters({}); }}
                className={`p-4 rounded-lg border text-left transition-all duration-150 ${
                  exportModule === mod.key
                    ? 'border-brand-500 bg-brand-50 ring-1 ring-brand-500'
                    : 'border-border hover:border-border-strong hover:bg-surface-secondary'
                }`}
              >
                <Icon className={`h-5 w-5 mb-2 ${exportModule === mod.key ? 'text-brand-600' : 'text-text-tertiary'}`} />
                <p className={`text-sm font-semibold ${exportModule === mod.key ? 'text-brand-700' : 'text-text-primary'}`}>{mod.label}</p>
                <p className="text-2xs text-text-tertiary mt-0.5">Export as CSV</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* Filters (Leads) */}
      {exportModule === 'leads' && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Filter Data (Optional)</h3>
          <p className="text-2xs text-text-tertiary mb-4">Leave blank to export all records</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Status</label>
              <select
                value={filters.status || ''}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="input"
              >
                <option value="">All Statuses</option>
                <option value="NEW">New</option>
                <option value="CONTACTED">Contacted</option>
                <option value="QUALIFIED">Qualified</option>
                <option value="PROPOSAL_SENT">Proposal Sent</option>
                <option value="NEGOTIATION">Negotiation</option>
                <option value="WON">Won</option>
                <option value="LOST">Lost</option>
              </select>
            </div>
            <div>
              <label className="label">Source</label>
              <select
                value={filters.source || ''}
                onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                className="input"
              >
                <option value="">All Sources</option>
                <option value="WEBSITE_FORM">Website Form</option>
                <option value="LIVE_CHAT">Live Chat Widget</option>
                <option value="FACEBOOK_ADS">Facebook Ads</option>
                <option value="GOOGLE_ADS">Google Ads</option>
                <option value="CSV_IMPORT">CSV Import</option>
                <option value="REFERRAL">Referral</option>
                <option value="EMAIL">Email</option>
                <option value="PHONE">Phone</option>
                <option value="MANUAL">Manual</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Assigned To</label>
              <select
                value={filters.assignedToId || ''}
                onChange={(e) => setFilters({ ...filters, assignedToId: e.target.value })}
                className="input"
              >
                <option value="">All Users</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Search</label>
            <input
              className="input max-w-sm"
              placeholder="Search by name, email, or company..."
              value={filters.search || ''}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Filters (Contacts) */}
      {exportModule === 'contacts' && (
        <div className="card p-6">
          <h3 className="text-sm font-semibold text-text-primary mb-1">Filter Data (Optional)</h3>
          <p className="text-2xs text-text-tertiary mb-4">Leave blank to export all contacts</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Lifecycle Stage</label>
              <select
                value={filters.status || ''}
                onChange={(e) => setFilters({ ...filters, status: e.target.value })}
                className="input"
              >
                <option value="">All Stages</option>
                <option value="SUBSCRIBER">Subscriber</option>
                <option value="LEAD">Lead</option>
                <option value="MARKETING_QUALIFIED">Marketing Qualified</option>
                <option value="SALES_QUALIFIED">Sales Qualified</option>
                <option value="OPPORTUNITY">Opportunity</option>
                <option value="CUSTOMER">Customer</option>
                <option value="EVANGELIST">Evangelist</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Source</label>
              <select
                value={filters.source || ''}
                onChange={(e) => setFilters({ ...filters, source: e.target.value })}
                className="input"
              >
                <option value="">All Sources</option>
                <option value="WEBSITE_FORM">Website Form</option>
                <option value="FACEBOOK_ADS">Facebook Ads</option>
                <option value="GOOGLE_ADS">Google Ads</option>
                <option value="CSV_IMPORT">CSV Import</option>
                <option value="REFERRAL">Referral</option>
                <option value="EMAIL">Email</option>
                <option value="PHONE">Phone</option>
                <option value="MANUAL">Manual</option>
                <option value="OTHER">Other</option>
              </select>
            </div>
            <div>
              <label className="label">Owner</label>
              <select
                value={filters.assignedToId || ''}
                onChange={(e) => setFilters({ ...filters, assignedToId: e.target.value })}
                className="input"
              >
                <option value="">All Users</option>
                {users.map((u: any) => (
                  <option key={u.id} value={u.id}>{u.firstName} {u.lastName}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-4">
            <label className="label">Search</label>
            <input
              className="input max-w-sm"
              placeholder="Search by name, email, or company..."
              value={filters.search || ''}
              onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            />
          </div>
        </div>
      )}

      {/* Export Action */}
      <div className="card p-6 text-center">
        <div className="h-14 w-14 rounded-2xl bg-brand-50 flex items-center justify-center mx-auto mb-4">
          <Download className="h-6 w-6 text-brand-600" />
        </div>
        <h3 className="text-sm font-semibold text-text-primary mb-1">Ready to Export</h3>
        <p className="text-2xs text-text-tertiary mb-4">
          Your data will be exported as a CSV file with UTF-8 encoding (Excel compatible).
        </p>
        <button onClick={handleExport} disabled={exporting} className="btn-primary">
          <Download className="h-4 w-4" />
          {exporting ? 'Exporting...' : `Export ${exportModule === 'leads' ? 'Leads' : exportModule === 'contacts' ? 'Contacts' : 'Campaigns'}`}
        </button>
      </div>
    </div>
  );
}

/* ─── Import History Tab ─────────────────────────────────────────── */
function ImportHistoryTab() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const importHistoryQuery = useImportHistoryQuery(page);
  const history = (importHistoryQuery.data?.data ?? []) as ImportHistoryItem[];
  const total = importHistoryQuery.data?.pagination?.total ?? 0;
  const loading = importHistoryQuery.isLoading;
  const [selectedImport, setSelectedImport] = useState<ImportHistoryItem | null>(null);
  const [undoing, setUndoing] = useState<string | null>(null);

  const isAdmin = user?.role === 'ADMIN';

  const addToast = useNotificationStore((s) => s.addToast);

  const handleUndo = async (id: string) => {
    const confirmed = await premiumConfirm({
      title: 'Undo this import?',
      message: 'Imported records will be moved to Recycle Bin or removed based on module behavior.',
      confirmText: 'Undo Import',
      cancelText: 'Cancel',
      variant: 'danger',
    });
    if (!confirmed) return;
    setUndoing(id);
    try {
      await api.undoImport(id);
      addToast({ type: 'success', title: 'Import undone', message: 'The import has been successfully reversed' });
      await queryClient.invalidateQueries({ queryKey: queryKeys.import.root });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Undo failed', message: err.message });
    } finally {
      setUndoing(null);
    }
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'COMPLETED': return <span className="badge bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"><CheckCircle2 className="h-3 w-3" /> Completed</span>;
      case 'PROCESSING': return <span className="badge bg-blue-50 text-blue-700 ring-1 ring-blue-200"><Clock className="h-3 w-3" /> Processing</span>;
      case 'FAILED': return <span className="badge bg-red-50 text-red-700 ring-1 ring-red-200"><XCircle className="h-3 w-3" /> Failed</span>;
      case 'UNDONE': return <span className="badge bg-gray-50 text-gray-700 ring-1 ring-gray-200"><RotateCcw className="h-3 w-3" /> Undone</span>;
      default: return <span className="badge bg-gray-50 text-gray-700">{status}</span>;
    }
  };

  return (
    <div className="space-y-4">
      {loading ? (
        <div className="card p-6">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 py-3 border-b border-border-subtle last:border-0">
              <div className="skeleton h-10 w-10 rounded-lg" />
              <div className="flex-1">
                <div className="skeleton h-4 w-48 mb-1" />
                <div className="skeleton h-3 w-32" />
              </div>
              <div className="skeleton h-5 w-20 rounded-md" />
            </div>
          ))}
        </div>
      ) : history.length === 0 ? (
        <div className="card p-12 text-center">
          <div className="h-14 w-14 rounded-2xl bg-gray-100 flex items-center justify-center mx-auto mb-4">
            <Clock className="h-6 w-6 text-text-tertiary" />
          </div>
          <h3 className="text-sm font-semibold text-text-primary mb-1">No import history yet</h3>
          <p className="text-2xs text-text-tertiary">Your import history will appear here after your first import.</p>
        </div>
      ) : (
        <>
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="table-header">
                  <th className="table-cell text-left">Import</th>
                  <th className="table-cell text-left">Module</th>
                  <th className="table-cell text-center">Rows</th>
                  <th className="table-cell text-center">Imported</th>
                  <th className="table-cell text-center">Skipped</th>
                  <th className="table-cell text-left">Status</th>
                  <th className="table-cell text-left">Imported By</th>
                  <th className="table-cell text-left">Date</th>
                  <th className="table-cell text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {history.map((item) => (
                  <tr key={item.id} className="table-row group">
                    <td className="table-cell">
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet className="h-4 w-4 text-text-tertiary" />
                        <span className="text-sm font-medium text-text-primary truncate max-w-[180px]">{item.fileName}</span>
                      </div>
                    </td>
                    <td className="table-cell">
                      <span className="text-sm capitalize text-text-secondary">{item.module}</span>
                    </td>
                    <td className="table-cell text-center text-sm text-text-primary">{item.totalRows}</td>
                    <td className="table-cell text-center">
                      <span className="text-sm font-medium text-emerald-600">{item.importedCount}</span>
                    </td>
                    <td className="table-cell text-center">
                      <span className="text-sm text-text-tertiary">{item.skippedCount}</span>
                    </td>
                    <td className="table-cell">{statusBadge(item.status)}</td>
                    <td className="table-cell">
                      <span className="text-2xs text-text-secondary">
                        {item.user ? `${item.user.firstName} ${item.user.lastName}` : '—'}
                      </span>
                    </td>
                    <td className="table-cell">
                      <span className="text-2xs text-text-tertiary">
                        {new Date(item.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </td>
                    <td className="table-cell text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => setSelectedImport(item)}
                          className="btn-icon h-7 w-7 opacity-0 group-hover:opacity-100"
                          title="View details"
                        >
                          <Eye className="h-3.5 w-3.5" />
                        </button>
                        {isAdmin && item.status === 'COMPLETED' && !item.undoneAt && (
                          <button
                            onClick={() => handleUndo(item.id)}
                            disabled={undoing === item.id}
                            className="btn-icon h-7 w-7 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-600 hover:bg-red-50"
                            title="Undo import"
                          >
                            <RotateCcw className={`h-3.5 w-3.5 ${undoing === item.id ? 'animate-spin' : ''}`} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > 20 && (
            <div className="flex justify-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="btn-secondary text-sm"
              >
                Previous
              </button>
              <span className="flex items-center text-sm text-text-secondary px-3">
                Page {page} of {Math.ceil(total / 20)}
              </span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / 20)}
                className="btn-secondary text-sm"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}

      {/* Import Detail Modal */}
      {selectedImport && (
        <ImportDetailModal importRecord={selectedImport} onClose={() => setSelectedImport(null)} />
      )}
    </div>
  );
}

/* ─── Import Detail Modal ────────────────────────────────────────── */
function ImportDetailModal({ importRecord, onClose }: { importRecord: ImportHistoryItem; onClose: () => void }) {
  const addToast = useNotificationStore((s) => s.addToast);
  const errors = (importRecord.errors || []) as any[];

  return (
    <div className="modal">
      <div className="overlay" onClick={onClose} />
      <div className="modal-panel w-full max-w-2xl relative z-50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
          <div>
            <h2 className="text-lg font-semibold text-text-primary">Import Details</h2>
            <p className="text-2xs text-text-tertiary mt-0.5">{importRecord.fileName}</p>
          </div>
          <button onClick={onClose} className="btn-icon"><X className="h-4 w-4" /></button>
        </div>

        <div className="p-6 space-y-4">
          {/* Stats Grid */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-surface-secondary text-center">
              <p className="text-lg font-bold text-text-primary">{importRecord.totalRows}</p>
              <p className="text-2xs text-text-tertiary">Total Rows</p>
            </div>
            <div className="p-3 rounded-lg bg-emerald-50 text-center">
              <p className="text-lg font-bold text-emerald-700">{importRecord.importedCount}</p>
              <p className="text-2xs text-emerald-600">Imported</p>
            </div>
            <div className="p-3 rounded-lg bg-blue-50 text-center">
              <p className="text-lg font-bold text-blue-700">{importRecord.updatedCount}</p>
              <p className="text-2xs text-blue-600">Updated</p>
            </div>
            <div className="p-3 rounded-lg bg-red-50 text-center">
              <p className="text-lg font-bold text-red-700">{importRecord.skippedCount}</p>
              <p className="text-2xs text-red-600">Skipped</p>
            </div>
          </div>

          {/* Metadata */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-2xs text-text-tertiary">Module</p>
              <p className="text-sm font-medium text-text-primary capitalize">{importRecord.module}</p>
            </div>
            <div>
              <p className="text-2xs text-text-tertiary">Duplicate Action</p>
              <p className="text-sm font-medium text-text-primary capitalize">{importRecord.duplicateAction}</p>
            </div>
            <div>
              <p className="text-2xs text-text-tertiary">File Size</p>
              <p className="text-sm font-medium text-text-primary">{(importRecord.fileSize / 1024).toFixed(1)} KB</p>
            </div>
            <div>
              <p className="text-2xs text-text-tertiary">Imported By</p>
              <p className="text-sm font-medium text-text-primary">
                {importRecord.user ? `${importRecord.user.firstName} ${importRecord.user.lastName}` : '—'}
              </p>
            </div>
            <div>
              <p className="text-2xs text-text-tertiary">Started</p>
              <p className="text-sm font-medium text-text-primary">
                {new Date(importRecord.createdAt).toLocaleString()}
              </p>
            </div>
            <div>
              <p className="text-2xs text-text-tertiary">Completed</p>
              <p className="text-sm font-medium text-text-primary">
                {importRecord.completedAt ? new Date(importRecord.completedAt).toLocaleString() : '—'}
              </p>
            </div>
          </div>

          {/* Errors */}
          {errors.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-text-primary">Errors ({errors.length})</h4>
                <button
                  onClick={() => api.downloadErrorsCsv(importRecord.id).catch((err: any) => addToast({ type: 'error', title: 'Download failed', message: err.message }))}
                  className="text-2xs text-brand-600 hover:text-brand-700 font-medium flex items-center gap-1"
                >
                  <Download className="h-3 w-3" />
                  Download Error Rows CSV
                </button>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {errors.map((err: any, i: number) => (
                  <div key={i} className="flex items-start gap-2 p-2 rounded bg-red-50 text-2xs text-red-700">
                    <XCircle className="h-3 w-3 flex-shrink-0 mt-0.5" />
                    <span>Row {err.row}: {err.error || err.message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {importRecord.undoneAt && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-amber-50 ring-1 ring-amber-200">
              <RotateCcw className="h-4 w-4 text-amber-600" />
              <p className="text-sm text-amber-800">
                This import was undone on {new Date(importRecord.undoneAt).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border-subtle flex justify-end">
          <button onClick={onClose} className="btn-secondary">Close</button>
        </div>
      </div>
    </div>
  );
}
