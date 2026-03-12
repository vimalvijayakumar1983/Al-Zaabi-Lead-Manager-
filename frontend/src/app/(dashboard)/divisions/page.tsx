'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import type { Organization } from '@/types';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Palette,
  X,
  Loader2,
  AlertTriangle,
  Users,
  Target,
} from 'lucide-react';

export default function DivisionsPage() {
  const router = useRouter();

  // Auth check
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [divisions, setDivisions] = useState<Organization[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingDivision, setEditingDivision] = useState<Organization | null>(null);
  const [saving, setSaving] = useState(false);
  const [modalError, setModalError] = useState('');

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  // Form fields
  const [formName, setFormName] = useState('');
  const [formTradeName, setFormTradeName] = useState('');
  const [formLogo, setFormLogo] = useState('');
  const [formPrimaryColor, setFormPrimaryColor] = useState('#6366f1');
  const [formSecondaryColor, setFormSecondaryColor] = useState('#1e293b');

  // Get user from auth store
  const { user } = useAuthStore();

  // Check authorization based on auth store
  useEffect(() => {
    if (user) {
      setAuthorized(user.role === 'SUPER_ADMIN');
    }
  }, [user]);

  const fetchDivisions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getDivisions();
      setDivisions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load divisions');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authorized) {
      fetchDivisions();
    }
  }, [authorized, fetchDivisions]);

  const openCreateModal = () => {
    setEditingDivision(null);
    setFormName('');
    setFormTradeName('');
    setFormLogo('');
    setFormPrimaryColor('#6366f1');
    setFormSecondaryColor('#1e293b');
    setModalError('');
    setShowModal(true);
  };

  const openEditModal = (division: Organization) => {
    setEditingDivision(division);
    setFormName(division.name);
    setFormTradeName(division.tradeName || '');
    setFormLogo(division.logo || '');
    setFormPrimaryColor(division.primaryColor || '#6366f1');
    setFormSecondaryColor(division.secondaryColor || '#1e293b');
    setModalError('');
    setShowModal(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      setModalError('Division name is required');
      return;
    }

    setSaving(true);
    setModalError('');

    try {
      const payload: Partial<Organization> = {
        name: formName.trim(),
        tradeName: formTradeName.trim() || undefined,
        logo: formLogo.trim() || undefined,
        primaryColor: formPrimaryColor,
        secondaryColor: formSecondaryColor,
      };

      if (editingDivision) {
        await api.updateDivision(editingDivision.id, payload);
      } else {
        await api.createDivision(payload);
      }

      setShowModal(false);
      fetchDivisions();

      // Refresh divisions in localStorage
      try {
        const freshDivisions = await api.getDivisions();
        localStorage.setItem('divisions', JSON.stringify(freshDivisions));
      } catch {
        // non-critical
      }
    } catch (err: any) {
      setModalError(err.message || 'Failed to save division');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!deletingId) return;
    setDeleting(true);
    try {
      await api.deleteDivision(deletingId);
      setDeletingId(null);
      setDeleteConfirm('');
      fetchDivisions();

      // Refresh divisions in localStorage
      try {
        const freshDivisions = await api.getDivisions();
        localStorage.setItem('divisions', JSON.stringify(freshDivisions));
      } catch {
        // non-critical
      }
    } catch (err: any) {
      setError(err.message || 'Failed to delete division');
    } finally {
      setDeleting(false);
    }
  };

  // Access denied state
  if (authorized === false) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <div className="h-16 w-16 rounded-2xl bg-red-50 flex items-center justify-center mb-4">
          <AlertTriangle className="h-8 w-8 text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-text-primary mb-1">Access Denied</h2>
        <p className="text-sm text-text-secondary mb-4">
          Only Super Admins can manage divisions.
        </p>
        <button onClick={() => router.push('/dashboard')} className="btn-primary">
          Go to Dashboard
        </button>
      </div>
    );
  }

  // Loading auth check
  if (authorized === null) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }

  const divisionToDelete = divisions.find((d) => d.id === deletingId);

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text-primary flex items-center gap-2">
            <Building2 className="h-7 w-7 text-brand-500" />
            Division Management
          </h1>
          <p className="text-sm text-text-secondary mt-1">
            Create and manage your organization&apos;s divisions
          </p>
        </div>
        <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Division
        </button>
      </div>

      {/* Error banner */}
      {error && (
        <div className="flex items-start gap-2.5 rounded-xl bg-red-50 border border-red-100 p-3.5 text-sm text-red-700">
          <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      )}

      {/* Empty state */}
      {!loading && divisions.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-20 bg-white rounded-2xl border border-border-subtle">
          <div className="h-16 w-16 rounded-2xl bg-brand-50 flex items-center justify-center mb-4">
            <Building2 className="h-8 w-8 text-brand-500" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-1">No divisions yet</h3>
          <p className="text-sm text-text-secondary mb-4">
            Create your first division to start organizing your team.
          </p>
          <button onClick={openCreateModal} className="btn-primary flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Add Division
          </button>
        </div>
      )}

      {/* Divisions table */}
      {!loading && divisions.length > 0 && (
        <div className="bg-white rounded-2xl border border-border-subtle overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border-subtle bg-surface-secondary/50">
                  <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-3">
                    Logo
                  </th>
                  <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-3">
                    Name
                  </th>
                  <th className="text-left text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-3">
                    Trade Name
                  </th>
                  <th className="text-center text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Users className="h-3.5 w-3.5" />
                      Users
                    </div>
                  </th>
                  <th className="text-center text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Target className="h-3.5 w-3.5" />
                      Leads
                    </div>
                  </th>
                  <th className="text-center text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-3">
                    <div className="flex items-center justify-center gap-1">
                      <Palette className="h-3.5 w-3.5" />
                      Color
                    </div>
                  </th>
                  <th className="text-right text-xs font-semibold text-text-secondary uppercase tracking-wider px-6 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {divisions.map((division) => (
                  <tr key={division.id} className="hover:bg-surface-secondary/30 transition-colors">
                    {/* Logo */}
                    <td className="px-6 py-4">
                      {division.logo ? (
                        <img
                          src={division.logo}
                          alt={division.name}
                          className="h-10 w-10 rounded-lg object-cover border border-border-subtle"
                        />
                      ) : (
                        <div
                          className="h-10 w-10 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                          style={{ backgroundColor: division.primaryColor || '#6366f1' }}
                        >
                          {division.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </td>
                    {/* Name */}
                    <td className="px-6 py-4">
                      <span className="font-medium text-text-primary">{division.name}</span>
                    </td>
                    {/* Trade Name */}
                    <td className="px-6 py-4">
                      <span className="text-sm text-text-secondary">
                        {division.tradeName || '—'}
                      </span>
                    </td>
                    {/* Users count */}
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {division._count?.users ?? 0}
                      </span>
                    </td>
                    {/* Leads count */}
                    <td className="px-6 py-4 text-center">
                      <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                        {division._count?.leads ?? 0}
                      </span>
                    </td>
                    {/* Primary Color */}
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <div
                          className="h-6 w-6 rounded-md border border-border-subtle shadow-sm"
                          style={{ backgroundColor: division.primaryColor || '#6366f1' }}
                          title={division.primaryColor}
                        />
                        <span className="text-xs text-text-tertiary font-mono">
                          {division.primaryColor || '#6366f1'}
                        </span>
                      </div>
                    </td>
                    {/* Actions */}
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => openEditModal(division)}
                          className="btn-icon h-8 w-8"
                          title="Edit division"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setDeletingId(division.id);
                            setDeleteConfirm('');
                          }}
                          className="btn-icon h-8 w-8 text-red-500 hover:bg-red-50"
                          title="Delete division"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setShowModal(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 overflow-hidden animate-fade-in-up">
            {/* Modal header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
              <h3 className="text-lg font-semibold text-text-primary flex items-center gap-2">
                <Building2 className="h-5 w-5 text-brand-500" />
                {editingDivision ? 'Edit Division' : 'Add Division'}
              </h3>
              <button
                onClick={() => setShowModal(false)}
                className="btn-icon h-8 w-8"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal body */}
            <div className="px-6 py-5 space-y-4">
              {modalError && (
                <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700">
                  <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Name */}
              <div>
                <label className="label">
                  Division Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className="input"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Healthcare Division"
                  autoFocus
                />
              </div>

              {/* Trade Name */}
              <div>
                <label className="label">Trade Name</label>
                <input
                  type="text"
                  className="input"
                  value={formTradeName}
                  onChange={(e) => setFormTradeName(e.target.value)}
                  placeholder="e.g. Al-Zaabi Healthcare"
                />
              </div>

              {/* Logo URL */}
              <div>
                <label className="label">Logo URL</label>
                <input
                  type="url"
                  className="input"
                  value={formLogo}
                  onChange={(e) => setFormLogo(e.target.value)}
                  placeholder="https://example.com/logo.png"
                />
                {formLogo && (
                  <div className="mt-2 flex items-center gap-2">
                    <img
                      src={formLogo}
                      alt="Logo preview"
                      className="h-10 w-10 rounded-lg object-cover border border-border-subtle"
                      onError={(e) => {
                        (e.target as HTMLImageElement).style.display = 'none';
                      }}
                    />
                    <span className="text-xs text-text-tertiary">Preview</span>
                  </div>
                )}
              </div>

              {/* Colors */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label flex items-center gap-1.5">
                    <Palette className="h-3.5 w-3.5" />
                    Primary Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-9 w-12 rounded-lg border border-border-subtle cursor-pointer"
                      value={formPrimaryColor}
                      onChange={(e) => setFormPrimaryColor(e.target.value)}
                    />
                    <input
                      type="text"
                      className="input flex-1 font-mono text-sm"
                      value={formPrimaryColor}
                      onChange={(e) => setFormPrimaryColor(e.target.value)}
                      placeholder="#6366f1"
                    />
                  </div>
                </div>
                <div>
                  <label className="label flex items-center gap-1.5">
                    <Palette className="h-3.5 w-3.5" />
                    Secondary Color
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      className="h-9 w-12 rounded-lg border border-border-subtle cursor-pointer"
                      value={formSecondaryColor}
                      onChange={(e) => setFormSecondaryColor(e.target.value)}
                    />
                    <input
                      type="text"
                      className="input flex-1 font-mono text-sm"
                      value={formSecondaryColor}
                      onChange={(e) => setFormSecondaryColor(e.target.value)}
                      placeholder="#1e293b"
                    />
                  </div>
                </div>
              </div>

              {/* Color preview */}
              <div className="rounded-xl overflow-hidden border border-border-subtle">
                <div className="h-3" style={{ backgroundColor: formPrimaryColor }} />
                <div className="p-3 flex items-center gap-3" style={{ backgroundColor: formSecondaryColor }}>
                  {formLogo ? (
                    <img src={formLogo} alt="" className="h-8 w-8 rounded-lg object-cover" />
                  ) : (
                    <div
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: formPrimaryColor }}
                    >
                      {formName.charAt(0).toUpperCase() || 'D'}
                    </div>
                  )}
                  <span className="text-sm font-medium text-white">
                    {formTradeName || formName || 'Division Preview'}
                  </span>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-secondary/30">
              <button
                onClick={() => setShowModal(false)}
                className="btn-secondary"
                disabled={saving}
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                className="btn-primary flex items-center gap-2"
                disabled={saving}
              >
                {saving ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    {editingDivision ? 'Update Division' : 'Create Division'}
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => {
              setDeletingId(null);
              setDeleteConfirm('');
            }}
          />
          <div className="relative bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-fade-in-up">
            <div className="px-6 py-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="h-12 w-12 rounded-xl bg-red-50 flex items-center justify-center">
                  <Trash2 className="h-6 w-6 text-red-500" />
                </div>
                <div>
                  <h3 className="text-lg font-semibold text-text-primary">Delete Division</h3>
                  <p className="text-sm text-text-secondary">This action cannot be undone.</p>
                </div>
              </div>

              <p className="text-sm text-text-secondary mb-4">
                Are you sure you want to delete{' '}
                <strong className="text-text-primary">
                  {divisionToDelete?.tradeName || divisionToDelete?.name}
                </strong>
                ? All users, leads, and data within this division will be permanently removed.
              </p>

              <div>
                <label className="label">
                  Type &quot;{divisionToDelete?.name}&quot; to confirm
                </label>
                <input
                  type="text"
                  className="input"
                  value={deleteConfirm}
                  onChange={(e) => setDeleteConfirm(e.target.value)}
                  placeholder={divisionToDelete?.name}
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border-subtle bg-surface-secondary/30">
              <button
                onClick={() => {
                  setDeletingId(null);
                  setDeleteConfirm('');
                }}
                className="btn-secondary"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="px-4 py-2 rounded-xl text-sm font-medium bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
                disabled={deleting || deleteConfirm !== divisionToDelete?.name}
              >
                {deleting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Delete Division
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
