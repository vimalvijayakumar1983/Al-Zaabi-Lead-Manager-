'use client';

import { useState, useRef, useEffect } from 'react';

interface InlineEditProps {
  value: string;
  onSave: (value: string) => Promise<void>;
  type?: 'text' | 'email' | 'tel' | 'number' | 'select';
  options?: { value: string; label: string }[];
  placeholder?: string;
  className?: string;
  displayClassName?: string;
}

export function InlineEdit({
  value,
  onSave,
  type = 'text',
  options,
  placeholder = '-',
  className = '',
  displayClassName = 'text-sm text-gray-700',
}: InlineEditProps) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | HTMLSelectElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLInputElement) {
        inputRef.current.select();
      }
    }
  }, [editing]);

  const handleSave = async () => {
    if (editValue === value) {
      setEditing(false);
      return;
    }
    setSaving(true);
    try {
      await onSave(editValue);
      setEditing(false);
    } catch (err: any) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setEditValue(value);
      setEditing(false);
    }
  };

  if (editing) {
    if (type === 'select' && options) {
      return (
        <select
          ref={inputRef as React.RefObject<HTMLSelectElement>}
          value={editValue}
          onChange={(e) => {
            setEditValue(e.target.value);
            // Auto-save on select
            setSaving(true);
            onSave(e.target.value).then(() => setEditing(false)).finally(() => setSaving(false));
          }}
          onBlur={() => setEditing(false)}
          className={`input text-sm py-1 px-2 ${className}`}
          disabled={saving}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
      );
    }

    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type={type === 'number' ? 'number' : type}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`input text-sm py-1 px-2 w-full min-w-[80px] ${className}`}
        disabled={saving}
        placeholder={placeholder}
      />
    );
  }

  return (
    <span
      onClick={() => {
        setEditValue(value);
        setEditing(true);
      }}
      className={`cursor-pointer hover:bg-brand-50 hover:text-brand-700 rounded px-1 py-0.5 -mx-1 transition-colors ${displayClassName}`}
      title="Click to edit"
    >
      {(options?.length ? options.find(o => o.value === value)?.label || value : value) || <span className="text-gray-400 italic">{placeholder}</span>}
    </span>
  );
}
