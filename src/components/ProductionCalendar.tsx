import React, { useState, useMemo } from 'react';
import { 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Check, 
  X, 
  RotateCcw, 
  Info,
  CalendarCheck,
  CalendarX,
  Zap
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '../utils';
import { SystemSettings } from '../types';

interface ProductionCalendarProps {
  settings: SystemSettings;
  onSettingsChange: (newSettings: SystemSettings) => void;
}

export default function ProductionCalendar({ settings, onSettingsChange }: ProductionCalendarProps) {
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  
  const months = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const date = new Date(selectedYear, i, 1);
      return {
        index: i,
        name: date.toLocaleString('zh-CN', { month: 'long' }),
        daysInMonth: new Date(selectedYear, i + 1, 0).getDate(),
        firstDayOfWeek: date.getDay() // 0 is Sunday
      };
    });
  }, [selectedYear]);

  const isWorkingDay = (year: number, month: number, day: number) => {
    const date = new Date(year, month, day);
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    
    // Check manual overrides first
    if (settings.calendarOverrides?.[dateKey] !== undefined) {
      return settings.calendarOverrides[dateKey];
    }
    
    // Default rules: 单休 (Sunday is rest)
    const dayOfWeek = date.getDay();
    const isSunday = dayOfWeek === 0;
    
    let isRest = false;
    if (isSunday) isRest = true;
    
    // Check custom holidays (legacy support)
    if (settings.customHolidays?.includes(dateKey)) isRest = true;
    
    return !isRest;
  };

  const toggleDay = (year: number, month: number, day: number) => {
    const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const currentStatus = isWorkingDay(year, month, day);
    const newStatus = !currentStatus;
    
    const newOverrides = { ...(settings.calendarOverrides || {}) };
    newOverrides[dateKey] = newStatus;
    
    onSettingsChange({
      ...settings,
      calendarOverrides: newOverrides
    });
  };

  const getMonthlyStats = (monthIndex: number) => {
    const month = months[monthIndex];
    let workingDays = 0;
    for (let d = 1; d <= month.daysInMonth; d++) {
      if (isWorkingDay(selectedYear, monthIndex, d)) workingDays++;
    }
    return {
      workingDays,
      restDays: month.daysInMonth - workingDays
    };
  };

  const batchAction = (type: 'weekends-single' | 'weekends-double' | 'all-working', monthIndex: number) => {
    const newOverrides = { ...(settings.calendarOverrides || {}) };
    const month = months[monthIndex];
    
    for (let d = 1; d <= month.daysInMonth; d++) {
      const date = new Date(selectedYear, monthIndex, d);
      const dateKey = `${selectedYear}-${String(monthIndex + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dayOfWeek = date.getDay();
      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isSunday = dayOfWeek === 0;
      
      if (type === 'all-working') {
        newOverrides[dateKey] = true;
      } else if (type === 'weekends-single') {
        // 单休: Sunday rest, Saturday working
        newOverrides[dateKey] = !isSunday;
      } else if (type === 'weekends-double') {
        // 双休: Weekend rest
        newOverrides[dateKey] = !isWeekend;
      }
    }
    
    onSettingsChange({
      ...settings,
      calendarOverrides: newOverrides
    });
  };

  const resetYear = () => {
    if (window.confirm(`确定要重置 ${selectedYear} 年的所有手动修改吗？`)) {
      const newOverrides = { ...(settings.calendarOverrides || {}) };
      Object.keys(newOverrides).forEach(key => {
        if (key.startsWith(`${selectedYear}-`)) {
          delete newOverrides[key];
        }
      });
      onSettingsChange({
        ...settings,
        calendarOverrides: newOverrides
      });
    }
  };

  return (
    <div className="max-w-[1400px] mx-auto space-y-8 pb-12">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-2xl bg-brand-red/10 text-brand-red flex items-center justify-center shadow-sm">
              <CalendarIcon size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">生产日历</h2>
              <p className="text-sm text-slate-500">配置全厂生产节拍与工作日，直接点击日期切换状态</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm">
          <button 
            onClick={() => setSelectedYear(prev => prev - 1)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
          >
            <ChevronLeft size={20} />
          </button>
          <span className="text-xl font-bold text-slate-800 px-4 min-w-[100px] text-center">
            {selectedYear} 年
          </span>
          <button 
            onClick={() => setSelectedYear(prev => prev + 1)}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-500"
          >
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-6">
        {months.map((month, mIdx) => {
          const stats = getMonthlyStats(mIdx);
          return (
            <motion.div 
              key={month.name}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: mIdx * 0.05 }}
              className="glass-card overflow-hidden flex flex-col"
            >
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                <h4 className="font-bold text-slate-800">{month.name}</h4>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">工作天数</p>
                  <p className="text-sm font-black text-blue-600">{stats.workingDays} 天</p>
                </div>
              </div>
              
              <div className="p-4 flex-1">
                <div className="grid grid-cols-7 gap-1 mb-2">
                  {['日', '一', '二', '三', '四', '五', '六'].map(d => (
                    <div key={d} className="text-center text-[10px] font-bold text-slate-400 py-1">
                      {d}
                    </div>
                  ))}
                </div>
                
                <div className="grid grid-cols-7 gap-1">
                  {/* Empty slots for first week */}
                  {Array.from({ length: month.firstDayOfWeek }).map((_, i) => (
                    <div key={`empty-${i}`} className="aspect-square" />
                  ))}
                  
                  {/* Days */}
                  {Array.from({ length: month.daysInMonth }).map((_, i) => {
                    const day = i + 1;
                    const working = isWorkingDay(selectedYear, mIdx, day);
                    return (
                      <button
                        key={day}
                        onClick={() => toggleDay(selectedYear, mIdx, day)}
                        className={cn(
                          "aspect-square rounded-lg flex flex-col items-center justify-center transition-all relative group",
                          working 
                            ? "bg-blue-50 text-blue-700 border border-blue-100 hover:bg-blue-100" 
                            : "bg-slate-50 text-slate-400 border border-slate-100 hover:bg-slate-100"
                        )}
                      >
                        <span className="text-xs font-bold">{day}</span>
                        <div className={cn(
                          "w-1 h-1 rounded-full mt-0.5 transition-all",
                          working ? "bg-blue-500 scale-100" : "bg-transparent scale-0"
                        )} />
                        
                        {/* Checkbox indicator */}
                        <div className={cn(
                          "absolute top-1 right-1 w-3 h-3 rounded-sm border flex items-center justify-center transition-all",
                          working 
                            ? "bg-blue-500 border-blue-500" 
                            : "bg-white border-slate-200 opacity-0 group-hover:opacity-100"
                        )}>
                          {working && <Check size={8} className="text-white" strokeWidth={4} />}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="p-3 border-t border-slate-100 flex items-center justify-center gap-2 bg-slate-50/30">
                <button onClick={() => batchAction('weekends-single', mIdx)} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded hover:border-blue-300">单休</button>
                <button onClick={() => batchAction('weekends-double', mIdx)} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded hover:border-blue-300">双休</button>
                <button onClick={() => batchAction('all-working', mIdx)} className="text-[10px] bg-white border border-slate-200 px-2 py-1 rounded hover:border-blue-300">无休</button>
              </div>
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
