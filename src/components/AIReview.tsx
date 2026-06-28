import React, { useEffect, useState, useCallback } from 'react';
import { Loader2, Sparkles, CheckCircle2, AlertTriangle, ChevronDown, ArrowLeft, RotateCcw } from 'lucide-react';
import { analyzeProductImage } from '../utils/gemini';
import { getCategories, getSubCategories, getProductTypes } from '../data/taxonomy';

interface AIReviewProps {
  platform: string;
  barcode: string;
  photographerId: string;
  imageBlob: Blob;
  onConfirm: (data: ReviewData) => void;
  onRetake: () => void;
}

export interface ReviewData {
  category: string;
  subCategory: string;
  productType: string;
  productName: string;
  brand: string;
  notes: string;
  confidence: number;
  imageBlob: Blob;
}

type Stage = 'analyzing' | 'review' | 'error';

export const AIReview: React.FC<AIReviewProps> = ({
  platform,
  barcode,
  photographerId,
  imageBlob,
  onConfirm,
  onRetake
}) => {
  const [stage, setStage] = useState<Stage>('analyzing');
  const [errorMsg, setErrorMsg] = useState('');
  const [imagePreview, setImagePreview] = useState('');
  const [aiConfidence, setAiConfidence] = useState(0);

  // Form fields
  const [category, setCategory] = useState('');
  const [subCategory, setSubCategory] = useState('');
  const [productType, setProductType] = useState('');
  const [productName, setProductName] = useState('');
  const [brand, setBrand] = useState('');
  const [notes, setNotes] = useState('');

  // Derived dropdown options
  const categories = getCategories();
  const subCategories = getSubCategories(category);
  const productTypes = getProductTypes(category, subCategory);

  // Generate image preview URL
  useEffect(() => {
    const url = URL.createObjectURL(imageBlob);
    setImagePreview(url);
    return () => URL.revokeObjectURL(url);
  }, [imageBlob]);

  // Run Gemini analysis on mount
  const runAnalysis = useCallback(async () => {
    setStage('analyzing');
    setErrorMsg('');
    try {
      const suggestion = await analyzeProductImage(imageBlob);
      setCategory(suggestion.category);
      setSubCategory(suggestion.sub_category);
      setProductType(suggestion.product);
      setProductName(suggestion.product);
      setBrand(suggestion.brand);
      setNotes(suggestion.notes);
      setAiConfidence(suggestion.confidence);
      setStage('review');
    } catch (err: any) {
      console.error('[AIReview] Gemini error:', err);
      setErrorMsg(err.message || 'Vision analysis failed');
      setStage('error');
    }
  }, [imageBlob]);

  useEffect(() => {
    runAnalysis();
  }, [runAnalysis]);

  // When category changes, reset dependent fields
  const handleCategoryChange = (val: string) => {
    setCategory(val);
    setSubCategory('');
    setProductType('');
  };

  const handleSubCategoryChange = (val: string) => {
    setSubCategory(val);
    setProductType('');
  };

  const handleConfirm = () => {
    if (!category || !subCategory || !productType || !productName.trim()) return;
    onConfirm({
      category,
      subCategory,
      productType,
      productName: productName.trim(),
      brand: brand.trim(),
      notes: notes.trim(),
      confidence: aiConfidence,
      imageBlob
    });
  };

  const getPlatformLabel = (id: string) => {
    const map: Record<string, string> = { amazon: 'Amazon', noon: 'Noon', al_nasser: 'Al-Nasser', jumia: 'Jumia' };
    return map[id] || id;
  };

  const confidenceColor = aiConfidence >= 0.75
    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/10'
    : aiConfidence >= 0.5
    ? 'text-amber-400 border-amber-500/30 bg-amber-500/10'
    : 'text-rose-400 border-rose-500/30 bg-rose-500/10';

  const canConfirm = category && subCategory && productType && productName.trim().length > 0;

  return (
    <div className="relative flex flex-col w-full h-full bg-slate-950 text-white overflow-hidden">

      {/* Header */}
      <div className="z-10 w-full px-4 py-3 glass flex items-center gap-3 border-b border-slate-800/60" style={{ paddingTop: 'calc(12px + env(safe-area-inset-top))' }}>
        <button
          onClick={onRetake}
          className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-4 h-4 text-slate-300" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">AI Review</div>
          <div className="text-sm font-extrabold text-white truncate">{getPlatformLabel(platform)} · {barcode}</div>
        </div>
        <div className="text-[10px] font-medium text-slate-500 shrink-0">{photographerId}</div>
      </div>

      {/* ── ANALYZING STAGE ── */}
      {stage === 'analyzing' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
          {/* Thumbnail */}
          {imagePreview && (
            <div className="w-32 h-32 rounded-2xl overflow-hidden border-2 border-indigo-500/30 shadow-[0_0_40px_rgba(99,102,241,0.15)]">
              <img src={imagePreview} className="w-full h-full object-cover" alt="captured product" />
            </div>
          )}

          <div className="flex flex-col items-center gap-3 text-center">
            <div className="relative">
              <Loader2 className="w-10 h-10 text-indigo-400 animate-spin" />
              <Sparkles className="w-4 h-4 text-indigo-300 absolute -top-1 -right-1" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white">Analyzing Product</h2>
              <p className="text-sm text-slate-400 mt-1">Gemini Vision is identifying the product...</p>
            </div>
          </div>
        </div>
      )}

      {/* ── ERROR STAGE ── */}
      {stage === 'error' && (
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-400" />
          <div>
            <h2 className="text-lg font-bold text-white">Analysis Failed</h2>
            <p className="text-sm text-slate-400 mt-2 max-w-xs">{errorMsg}</p>
          </div>
          <div className="flex gap-3 w-full max-w-xs">
            <button
              onClick={onRetake}
              className="flex-1 py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold rounded-xl transition-colors cursor-pointer text-sm"
            >
              Retake Photo
            </button>
            <button
              onClick={runAnalysis}
              className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-colors cursor-pointer text-sm flex items-center justify-center gap-2"
            >
              <RotateCcw className="w-4 h-4" /> Retry
            </button>
          </div>
        </div>
      )}

      {/* ── REVIEW STAGE ── */}
      {stage === 'review' && (
        <div className="flex-1 overflow-y-auto">
          <div className="flex flex-col gap-0">

            {/* Photo + confidence strip */}
            <div className="flex items-center gap-4 px-4 pt-4 pb-3">
              <div className="w-20 h-20 rounded-xl overflow-hidden border border-slate-700/60 shrink-0">
                <img src={imagePreview} className="w-full h-full object-cover" alt="product" />
              </div>
              <div className="flex flex-col gap-2 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-xs font-bold text-indigo-300 uppercase tracking-widest">AI Suggestion</span>
                </div>
                <div className={`inline-flex items-center gap-1.5 self-start px-2.5 py-1 rounded-full border text-xs font-bold ${confidenceColor}`}>
                  {Math.round(aiConfidence * 100)}% confidence
                </div>
                <p className="text-[11px] text-slate-500 leading-tight">
                  Review and edit below, then confirm to save.
                </p>
              </div>
            </div>

            <div className="h-px bg-slate-800/60 mx-4" />

            {/* Form */}
            <div className="flex flex-col gap-0 px-4 pt-3 pb-4">

              {/* Category */}
              <FormField label="Category" required>
                <SelectField
                  value={category}
                  onChange={handleCategoryChange}
                  options={categories}
                  placeholder="Select category"
                />
              </FormField>

              {/* Sub-Category */}
              <FormField label="Sub-Category" required>
                <SelectField
                  value={subCategory}
                  onChange={handleSubCategoryChange}
                  options={subCategories}
                  placeholder={category ? 'Select sub-category' : 'Select a category first'}
                  disabled={!category}
                />
              </FormField>

              {/* Product Type */}
              <FormField label="Product Type" required>
                <SelectField
                  value={productType}
                  onChange={setProductType}
                  options={productTypes}
                  placeholder={subCategory ? 'Select product type' : 'Select a sub-category first'}
                  disabled={!subCategory}
                />
              </FormField>

              <div className="h-px bg-slate-800/40 my-2" />

              {/* Product Name */}
              <FormField label="Product Name" required>
                <input
                  type="text"
                  value={productName}
                  onChange={e => setProductName(e.target.value)}
                  placeholder="e.g. Samsung Galaxy A15 6GB/128GB Black"
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </FormField>

              {/* Brand */}
              <FormField label="Brand">
                <input
                  type="text"
                  value={brand}
                  onChange={e => setBrand(e.target.value)}
                  placeholder="e.g. Samsung"
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </FormField>

              {/* Notes */}
              <FormField label="Notes">
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Color, size, model number, any important details..."
                  rows={2}
                  className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700/60 rounded-xl text-sm text-white placeholder-slate-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </FormField>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Button */}
      {stage === 'review' && (
        <div className="z-10 w-full px-4 pt-3 pb-2 glass border-t border-slate-800/60" style={{ paddingBottom: 'calc(12px + env(safe-area-inset-bottom))' }}>
          <button
            onClick={handleConfirm}
            disabled={!canConfirm}
            className={`w-full py-3 rounded-2xl font-bold text-base flex items-center justify-center gap-2.5 transition-all cursor-pointer shadow-lg
              ${canConfirm
                ? 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-900/40'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'
              }`}
          >
            <CheckCircle2 className="w-5 h-5" />
            Confirm & Save to Sheet
          </button>
          {!canConfirm && (
            <p className="text-center text-[10px] text-slate-500 mt-1.5">Fill in Category, Sub-Category, Product Type, and Name</p>
          )}
        </div>
      )}
    </div>
  );
};

// ── Sub-components ──

function FormField({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5 mb-3">
      <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider px-0.5">
        {label}{required && <span className="text-rose-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function SelectField({
  value,
  onChange,
  options,
  placeholder,
  disabled = false
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full appearance-none px-3 py-2.5 pr-8 bg-slate-900 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors
          ${disabled
            ? 'border-slate-800 text-slate-600 cursor-not-allowed'
            : 'border-slate-700/60 text-white cursor-pointer hover:border-slate-600'
          }
          ${!value && !disabled ? 'text-slate-500' : ''}
        `}
      >
        <option value="" disabled>{placeholder}</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown className={`absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none ${disabled ? 'text-slate-700' : 'text-slate-400'}`} />
    </div>
  );
}
