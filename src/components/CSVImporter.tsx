import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { Upload, FileText, X, CheckCircle2 } from 'lucide-react';
import { cn } from '../utils';

interface CSVImporterProps<T> {
  onDataImported: (data: T[]) => void;
  title: string;
  templateLabel: string;
  expectedKeys: string[];
}

export default function CSVImporter<T>({ onDataImported, title, templateLabel, expectedKeys }: CSVImporterProps<T>) {
  const [isDragging, setIsDragging] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFileUpload = (file: File) => {
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const isCSV = file.name.endsWith('.csv');

    if (!isExcel && !isCSV) {
      setError('请上传 Excel (.xlsx, .xls) 或 CSV 格式的文件');
      return;
    }

    setFileName(file.name);
    setError(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = e.target?.result;
        const workbook = XLSX.read(data, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        
        // Convert to JSON
        // For the complex CSV provided by the user, we might need to handle headers carefully.
        // But for standard imports, we'll use header: 1 to get raw rows and then map them.
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
        
        if (rawRows.length === 0) {
          setError('文件内容为空');
          return;
        }

        // Find the header row (the one that contains most of our expected keys or looks like a header)
        // For the user's specific CSV, the data starts after row 2 (index 2)
        // We'll try to find a row that has "中心" or "设备" or just use the first row if it's standard.
        
        let headerIndex = 0;
        for (let i = 0; i < Math.min(rawRows.length, 5); i++) {
          const row = rawRows[i];
          if (row.some(cell => typeof cell === 'string' && (cell.includes('中心') || cell.includes('设备') || cell.includes('名称')))) {
            headerIndex = i;
            break;
          }
        }

        const headers = rawRows[headerIndex];
        const dataRows = rawRows.slice(headerIndex + 1);

        const formattedData = dataRows.filter(row => row.length > 0 && row[0] !== undefined).map((row, index) => {
          const obj: any = { id: `import-${index}` };
          
          // Mapping logic for the specific "Work Center" structure
          // Based on the image and CSV provided
          if (expectedKeys.includes('centerName')) {
            obj.centerName = row[0] || row[1]; // Center name is usually first or second
            obj.quantity = parseFloat(row[1]) || parseFloat(row[2]) || 0;
            obj.totalShiftDuration = parseFloat(row[3]) || 8;
            obj.attendanceRate = 0.95; // Default if not found
            obj.oee = parseFloat(row[4]) || 0.85;
          } else {
            // Standard mapping
            expectedKeys.forEach((key, i) => {
              obj[key] = row[i];
            });
          }
          
          return obj;
        });

        if (formattedData.length === 0) {
          setError('未能解析出有效数据');
          return;
        }

        onDataImported(formattedData as T[]);
      } catch (err) {
        setError(`解析失败: ${err instanceof Error ? err.message : '未知错误'}`);
      }
    };

    reader.onerror = () => {
      setError('文件读取失败');
    };

    reader.readAsBinaryString(file);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
        <span className="text-xs text-slate-500 italic">{templateLabel}</span>
      </div>

      <div
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          const file = e.dataTransfer.files[0];
          if (file) handleFileUpload(file);
        }}
        className={cn(
          "relative border-2 border-dashed rounded-xl p-8 transition-all duration-200 flex flex-col items-center justify-center gap-3 cursor-pointer",
          isDragging ? "border-brand-red bg-brand-red/5" : "border-slate-200 hover:border-slate-300 bg-slate-50/50"
        )}
        onClick={() => {
          const input = document.createElement('input');
          input.type = 'file';
          input.accept = '.csv,.xlsx,.xls';
          input.onchange = (e) => {
            const file = (e.target as HTMLInputElement).files?.[0];
            if (file) handleFileUpload(file);
          };
          input.click();
        }}
      >
        {fileName ? (
          <div className="flex flex-col items-center gap-2">
            <div className="w-12 h-12 rounded-full bg-emerald-100 flex items-center justify-center text-emerald-600">
              <CheckCircle2 size={24} />
            </div>
            <p className="text-sm font-medium text-slate-700">{fileName}</p>
            <button 
              onClick={(e) => { e.stopPropagation(); setFileName(null); }}
              className="text-xs text-slate-400 hover:text-slate-600 flex items-center gap-1"
            >
              <X size={12} /> 移除文件
            </button>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
              <Upload size={24} />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-slate-700">点击或拖拽上传 Excel/CSV 文件</p>
              <p className="text-xs text-slate-400 mt-1">支持 .xlsx, .xls, .csv 格式</p>
            </div>
          </>
        )}
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-50 text-red-600 text-xs flex items-start gap-2">
          <X size={14} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
