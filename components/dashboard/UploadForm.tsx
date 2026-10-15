'use client';

import { useRouter } from 'next/navigation';
import { useState, FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiFetch } from '@/lib/api-base';
import { ACCEPT_ATTRIBUTE, FORMAT_LABEL } from '@/lib/import/formats';

interface ImportResult {
  importBatchId: string;
  transactionCount: number;
  duplicateCount: number;
  errorCount: number;
  categories: Record<string, number>;
  notes?: string[];
}

export function UploadForm({ onImported }: { onImported?: () => void }) {
  const router = useRouter();
  const [accountName, setAccountName] = useState('My Account');
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Please choose a statement file.');
      return;
    }
    setStatus('uploading');
    setError(null);

    const formData = new FormData();
    formData.set('file', file);
    formData.set('accountId', 'new');
    formData.set('accountName', accountName || 'My Account');

    try {
      const res = await apiFetch('/api/import', { method: 'POST', body: formData });
      const data = await res.json();
      if (!res.ok) {
        setStatus('error');
        setError(data.message ?? 'Import failed.');
        return;
      }
      setResult(data);
      setStatus('done');
      router.refresh();
      onImported?.();
    } catch {
      setStatus('error');
      setError('Network error while uploading.');
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Import a statement</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="accountName">
              Account name
            </label>
            <input
              id="accountName"
              className="h-10 rounded-lg border border-slate-300 px-3 text-sm shadow-sm transition-colors hover:border-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              placeholder="e.g. Chase Sapphire"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-sm font-medium text-slate-700" htmlFor="file">
              Statement file
            </label>
            <input
              id="file"
              type="file"
              accept={ACCEPT_ATTRIBUTE}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="text-sm text-slate-600 file:mr-3 file:cursor-pointer file:rounded-lg file:border-0 file:bg-brand-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-brand-700 hover:file:bg-brand-100"
            />
            <p className="text-xs text-slate-500">{FORMAT_LABEL}. Up to 4 MB.</p>
          </div>
          <Button type="submit" disabled={status === 'uploading'}>
            {status === 'uploading' ? 'Importing…' : 'Import statement'}
          </Button>

          {error && <p className="text-sm text-red-600">{error}</p>}

          {result && status === 'done' && (
            <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-800 ring-1 ring-inset ring-emerald-200">
              Imported {result.transactionCount} transactions
              {result.duplicateCount > 0 && ` (${result.duplicateCount} duplicates skipped)`}.
              {result.errorCount > 0 && ` ${result.errorCount} lines looked like transactions but could not be read.`}
              {result.notes?.map((n) => (
                <p key={n} className="mt-1 text-xs text-emerald-900">
                  {n}
                </p>
              ))}
            </div>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
