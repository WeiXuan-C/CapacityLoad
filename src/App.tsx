import React, { useState, useMemo, useRef, useEffect } from 'react';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { FixedSizeList } from 'react-window';
import { 
  LayoutGrid, 
  ClipboardList, 
  Network, 
  Users, 
  Timer, 
  Settings, 
  Menu,
  ChevronRight,
  ChevronDown,
  User,
  Bell,
  Calendar,
  Check,
  X,
  ListOrdered,
  Upload,
  Download,
  Trash2,
  Plus,
  MoreHorizontal,
  RotateCcw,
  AlertCircle,
  Search,
  Filter,
  Shield,
  Activity,
  Database,
  Monitor,
  Save,
  Clock,
  Zap,
  Hash,
  FileText,
  BarChart3,
  CheckCircle2,
  AlertTriangle,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { cn, sortTeams, DEFAULT_TEAM_ORDER, DEFAULT_TEAM_ORDER_VERSION } from './utils';
import { useCapacityAnalysis } from './hooks/useCapacityAnalysis';
import CapacityAnalysis from './components/CapacityAnalysis';
import Combobox from './components/Combobox';
import { DraggableTeamList } from './components/DraggableTeamList';
import ProductionCalendar from './components/ProductionCalendar';
import ExceptionMonitoring from './components/ExceptionMonitoring';
import { ProductionDemand, ProductionResource, StandardTime, ProcessCycle, AnalysisResult, SystemSettings, MonthlyTeamAnalysis } from './types';

type Tab = 'analysis' | 'demand' | 'resources' | 'standard-time' | 'process-cycle' | 'calendar' | 'settings' | 'exceptions';

interface SystemMessage {
  id: string;
  type: 'success' | 'warning' | 'info' | 'error';
  title: string;
  content: string;
  time: Date;
  isRead: boolean;
  category: 'import' | 'exception' | 'system';
}

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('analysis');
  const [dashboardFilters, setDashboardFilters] = useState(() => {
    try {
      const saved = localStorage.getItem('aps_dashboard_filters');
      return saved ? JSON.parse(saved) : { year: 'all', month: 'all', team: 'all' };
    } catch {
      return { year: 'all', month: 'all', team: 'all' };
    }
  });
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isConfirmingClear, setIsConfirmingClear] = useState(false);
  const [isConfirmingClearProcessCycles, setIsConfirmingClearProcessCycles] = useState(false);
  const [isConfirmingClearResources, setIsConfirmingClearResources] = useState(false);
  const [isConfirmingClearDemands, setIsConfirmingClearDemands] = useState(false);
  const [selectedTeams, setSelectedTeams] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<{ id: string; type: 'success' | 'error' | 'info'; message: string }[]>([]);
  const [systemMessages, setSystemMessages] = useState<SystemMessage[]>([]);
  const [isBellOpen, setIsBellOpen] = useState(false);
  const bellRef = useRef<HTMLDivElement>(null);

  const addSystemMessage = (message: Omit<SystemMessage, 'id' | 'time' | 'isRead'>) => {
    const newMessage: SystemMessage = {
      ...message,
      id: Math.random().toString(36).substr(2, 9),
      time: new Date(),
      isRead: false
    };
    setSystemMessages(prev => [newMessage, ...prev].slice(0, 50));
  };

  const markAllAsRead = () => {
    setSystemMessages(prev => prev.map(m => ({ ...m, isRead: true })));
  };

  const clearMessages = () => {
    setSystemMessages([]);
  };

  const [demands, setDemands] = useState<ProductionDemand[]>([]);
  const [showDemandsList, setShowDemandsList] = useState<boolean>(false);
  const [searchProcessCycle, setSearchProcessCycle] = useState('');
  const [searchResource, setSearchResource] = useState('');
  const [searchStandardTime, setSearchStandardTime] = useState('');
  const [isImportingDemands, setIsImportingDemands] = useState(false);

  const addNotification = (type: 'success' | 'error' | 'info', message: string) => {
    const id = Math.random().toString(36).substr(2, 9);
    setNotifications(prev => [...prev, { id, type, message }]);
    setTimeout(() => {
      setNotifications(prev => prev.filter(n => n.id !== id));
    }, 5000);
  };
  const [resources, setResources] = useState<ProductionResource[]>(() => {
    try {
      const saved = localStorage.getItem('aps_resources');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch { return []; }
  });
  const [standardTimes, setStandardTimes] = useState<StandardTime[]>(() => {
    try {
      const saved = localStorage.getItem('aps_standard_times');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch { return []; }
  });
  const [processCycles, setProcessCycles] = useState<ProcessCycle[]>(() => {
    try {
      const saved = localStorage.getItem('aps_process_cycles');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
    } catch { return []; }
  });

  const filteredProcessCycles = useMemo(() => {
    if (!searchProcessCycle.trim()) return processCycles;
    const search = searchProcessCycle.toLowerCase().trim();
    return processCycles.filter(pc => 
      (pc.opCode || '').toLowerCase().includes(search) || 
      (pc.opName || '').toLowerCase().includes(search)
    );
  }, [processCycles, searchProcessCycle]);

  const filteredResources = useMemo(() => {
    let result = resources;
    
    if (selectedTeams.length > 0) {
      result = result.filter(r => selectedTeams.includes(r.team));
    }

    if (searchResource.trim()) {
      const search = searchResource.toLowerCase().trim();
      result = result.filter(r => 
        (r.id || '').toLowerCase().includes(search) || 
        (r.groupName || '').toLowerCase().includes(search)
      );
    }
    
    return result;
  }, [resources, searchResource, selectedTeams]);

  const filteredStandardTimes = useMemo(() => {
    if (!searchStandardTime.trim()) return standardTimes;
    const search = searchStandardTime.toLowerCase().trim();
    return standardTimes.filter(s => 
      (s.groupName || '').toLowerCase().includes(search)
    );
  }, [standardTimes, searchStandardTime]);

  const isRowModified = (item: StandardTime | ProcessCycle | ProductionResource | ProductionDemand) => {
    if (!item.original) return false;
    if ('team' in item) {
      // ProductionResource
      const itm = item as ProductionResource;
      const orig = itm.original as any;
      return (
        itm.id !== orig.id ||
        itm.groupName !== orig.groupName ||
        itm.team !== orig.team ||
        itm.workshop !== orig.workshop
      );
    } else if ('orderNo' in item) {
      // ProductionDemand
      const itm = item as ProductionDemand;
      const orig = itm.original as any;
      return (
        itm.orderNo !== orig.orderNo ||
        itm.componentCode !== orig.componentCode ||
        itm.componentDesc !== orig.componentDesc ||
        itm.opNo !== orig.opNo ||
        itm.opCode !== orig.opCode ||
        itm.opDesc !== orig.opDesc ||
        itm.resourceGroupId !== orig.resourceGroupId ||
        itm.dueDate !== orig.dueDate ||
        itm.requiredQty !== orig.requiredQty ||
        itm.completedQty !== orig.completedQty ||
        itm.actualHours !== orig.actualHours
      );
    } else if ('opCode' in item) {
      // ProcessCycle
      const itm = item as ProcessCycle;
      const orig = itm.original as any;
      return (
        itm.opCode !== orig.opCode ||
        itm.opName !== orig.opName ||
        itm.cycleDays !== orig.cycleDays
      );
    } else {
      // StandardTime
      const itm = item as any;
      const orig = itm.original as any;
      return (
        itm.groupName !== orig.groupName ||
        itm.peopleCount !== orig.peopleCount ||
        itm.peopleShifts !== orig.peopleShifts ||
        itm.peopleDuration !== orig.peopleDuration ||
        itm.peopleOee !== orig.peopleOee ||
        itm.machineCount !== orig.machineCount ||
        itm.machineShifts !== orig.machineShifts ||
        itm.machineDuration !== orig.machineDuration ||
        itm.machineOee !== orig.machineOee
      );
    }
  };

  const isFieldModified = <T extends StandardTime | ProcessCycle | ProductionResource | ProductionDemand>(item: T, field: string) => {
    if (!item.original) return false;
    return (item as any)[field] !== (item.original as any)[field];
  };

  const restoreRow = (idx: number, type: 'standard' | 'process' | 'resource' | 'demand') => {
    if (type === 'standard') {
      const item = standardTimes[idx];
      if (!item.original) return;
      const newTimes = [...standardTimes];
      newTimes[idx] = { ...item, ...item.original };
      setStandardTimes(newTimes);
      addNotification('info', `已恢复班组 "${item.groupName}" 的原始数据`);
    } else if (type === 'process') {
      const item = processCycles[idx];
      if (!item.original) return;
      const newCycles = [...processCycles];
      newCycles[idx] = { ...item, ...item.original };
      setProcessCycles(newCycles);
      addNotification('info', `已恢复工序 "${item.opName || item.opCode}" 的原始数据`);
    } else if (type === 'resource') {
      const item = resources[idx];
      if (!item.original) return;
      const newResources = [...resources];
      newResources[idx] = { ...item, ...item.original };
      setResources(newResources);
      addNotification('info', `已恢复资源组 "${item.groupName}" 的原始数据`);
    } else {
      const item = demands[idx];
      if (!item.original) return;
      const newDemands = [...demands];
      newDemands[idx] = { ...item, ...item.original };
      setDemands(newDemands);
      addNotification('info', `已恢复需求 "${item.orderNo}" 的原始数据`);
    }
  };

  const [settings, setSettings] = useState<SystemSettings>(() => {
    try {
      const saved = localStorage.getItem('aps_settings');
      const parsed = saved ? JSON.parse(saved) || {} : {};
      return {
        schedulingStrategy: parsed.schedulingStrategy || 'EDD',
        alertThreshold: parsed.alertThreshold || 85,
        displayDensity: parsed.displayDensity || 'comfortable',
        calendarOverrides: parsed.calendarOverrides || {},
        teamOrder: (parsed.teamOrderVersion !== DEFAULT_TEAM_ORDER_VERSION) 
          ? undefined 
          : (Array.isArray(parsed.teamOrder) ? parsed.teamOrder.filter(Boolean) : undefined),
        teamOrderVersion: parsed.teamOrderVersion || DEFAULT_TEAM_ORDER_VERSION,
        defaultCycleDays: parsed.defaultCycleDays ?? 2,
        aggregationLogic: parsed.aggregationLogic || 'startDate'
      };
    } catch {
      return {
        schedulingStrategy: 'EDD',
        alertThreshold: 85,
        displayDensity: 'comfortable',
        calendarOverrides: {},
        teamOrder: undefined,
        teamOrderVersion: DEFAULT_TEAM_ORDER_VERSION,
        defaultCycleDays: 2,
        aggregationLogic: 'startDate'
      };
    }
  });

  const uniqueTeams = useMemo(() => {
    return sortTeams(Array.from(new Set(resources.map(r => r?.team).filter(Boolean))), settings.teamOrder);
  }, [resources, settings.teamOrder]);

  // Auto-save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('aps_resources', JSON.stringify(resources));
      localStorage.setItem('aps_standard_times', JSON.stringify(standardTimes));
      localStorage.setItem('aps_process_cycles', JSON.stringify(processCycles));
      localStorage.setItem('aps_settings', JSON.stringify(settings));
      localStorage.setItem('aps_dashboard_filters', JSON.stringify(dashboardFilters));
    } catch (e) {
      console.warn('Failed to save to localStorage, possibly due to quota limits:', e);
    }
  }, [resources, standardTimes, processCycles, settings, dashboardFilters]);

  // Real capacity analysis calculation logic
  const analysisResult = useCapacityAnalysis(demands, resources, standardTimes, settings, processCycles);

  // Monitor exceptions for system messages
  const lastExceptionCount = useRef({ rg: 0, op: 0 });
  useEffect(() => {
    const rgCount = analysisResult.exceptions.unmatchedResourceGroups.length;
    const opCount = analysisResult.exceptions.unmatchedOperations.length;

    if (rgCount > 0 || opCount > 0) {
      if (rgCount !== lastExceptionCount.current.rg || opCount !== lastExceptionCount.current.op) {
        const parts = [];
        if (rgCount > 0) parts.push(`${rgCount} 个未匹配班组`);
        if (opCount > 0) parts.push(`${opCount} 个未匹配工序周期`);
        
        addSystemMessage({
          type: 'warning',
          title: '数据异常监控通知',
          content: `系统检测到 ${parts.join('和')}。请及时在异常监控模块查看并处理。`,
          category: 'exception'
        });
      }
    }
    lastExceptionCount.current = { rg: rgCount, op: opCount };
  }, [analysisResult.exceptions]);

  // Close bell dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(event.target as Node)) {
        setIsBellOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const navItems = [
    { id: 'analysis', label: '总览看板', icon: LayoutGrid },
    { id: 'demand', label: '生产需求', icon: ClipboardList },
    { id: 'resources', label: '资源分组', icon: Network },
    { id: 'standard-time', label: '标准工时', icon: Timer },
    { id: 'process-cycle', label: '工序周期', icon: Clock },
    { id: 'calendar', label: '生产日历', icon: Calendar },
    { id: 'exceptions', label: '异常监控', icon: AlertCircle },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'analysis':
        return (
          <CapacityAnalysis 
            data={analysisResult} 
            demands={demands} 
            resources={resources} 
            settings={settings} 
            filters={dashboardFilters}
            onFiltersChange={setDashboardFilters}
          />
        );
      case 'demand':
        return (
          <div className="space-y-6 max-w-[98%] mx-auto">
            <div className="glass-card p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
                    <ClipboardList size={22} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">生产需求明细</h3>
                    <p className="text-sm text-slate-500">共 {demands.length} 条记录</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Clear Action */}
                  <button 
                    onClick={() => {
                      if (isConfirmingClearDemands) {
                        setDemands([]);
                        setIsConfirmingClearDemands(false);
                      } else {
                        setIsConfirmingClearDemands(true);
                        setTimeout(() => setIsConfirmingClearDemands(false), 3000);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all border text-sm",
                      isConfirmingClearDemands 
                        ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100 animate-pulse" 
                        : "bg-white text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-100 hover:bg-red-50"
                    )}
                  >
                    <Trash2 size={16} />
                    <span>{isConfirmingClearDemands ? '确认清空?' : '清空'}</span>
                  </button>

                  <div className="h-6 w-px bg-slate-200 mx-1" />

                  {/* Data Management Group */}
                  <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
                    <button
                      onClick={() => setShowDemandsList(!showDemandsList)}
                      className={cn(
                        "flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all font-medium text-sm",
                        showDemandsList ? "text-slate-600 hover:bg-white hover:text-blue-600" : "bg-blue-100 text-blue-700"
                      )}
                      title={showDemandsList ? "隐藏列表以提升性能" : "显示列表"}
                    >
                      <LayoutGrid size={14} />
                      <span>{showDemandsList ? '隐藏' : '显示'}</span>
                    </button>
                    <div className="w-px h-4 bg-slate-300 mx-1" />
                    <button 
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.csv,.xlsx,.xls';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;

                          setIsImportingDemands(true);
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            try {
                              const arrayBuffer = event.target?.result as ArrayBuffer;
                              let workbook;
                              
                              if (file.name.toLowerCase().endsWith('.csv')) {
                                let text;
                                try {
                                  const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                                  text = utf8Decoder.decode(arrayBuffer);
                                } catch (e) {
                                  const gbkDecoder = new TextDecoder('gbk');
                                  text = gbkDecoder.decode(arrayBuffer);
                                }
                                workbook = XLSX.read(text, { type: 'string' });
                              } else {
                                workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
                              }
                              
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                              
                              if (rawRows.length === 0) {
                                addNotification('error', '文件内容为空');
                                setIsImportingDemands(false);
                                return;
                              }

                              const targetHeaders = ['工单号', '工单工序号', '组件物料编码', '组件描述', '工序号', '工序代码', '工序描述', '资源组ID', '交货日期', '需求数量', '完成数量', '实际工时', '工序完成'];
                              let headerIndex = -1;
                              
                              for (let i = 0; i < Math.min(rawRows.length, 20); i++) {
                                const row = rawRows[i];
                                if (!row) continue;
                                const matchCount = targetHeaders.filter(h => row.some(cell => String(cell).trim() === h)).length;
                                if (matchCount >= 3) {
                                  headerIndex = i;
                                  break;
                                }
                              }

                              if (headerIndex === -1) {
                                addNotification('error', '验证失败：未找到符合要求的表头行。');
                                setIsImportingDemands(false);
                                return;
                              }

                              const headerRow = rawRows[headerIndex];
                              const missingHeaders = targetHeaders.filter(h => !headerRow.some(cell => String(cell).trim() === h));
                              
                              if (missingHeaders.length > 0) {
                                addNotification('error', `验证失败：缺少必要表头：${missingHeaders.join('、')}`);
                                setIsImportingDemands(false);
                                return;
                              }

                              const getColIndex = (name: string) => headerRow.findIndex(cell => String(cell).trim() === name);

                              const colMap = {
                                orderNo: getColIndex('工单号'),
                                workOrderOpNo: getColIndex('工单工序号'),
                                componentCode: getColIndex('组件物料编码'),
                                componentDesc: getColIndex('组件描述'),
                                partNumber: getColIndex('料号'),
                                opNo: getColIndex('工序号'),
                                opCode: getColIndex('工序代码'),
                                opDesc: getColIndex('工序描述'),
                                resourceGroupId: getColIndex('资源组ID'),
                                resourceGroupDesc: getColIndex('资源组描述'),
                                dueDate: getColIndex('交货日期'),
                                requiredQty: getColIndex('需求数量'),
                                completedQty: getColIndex('完成数量'),
                                actualHours: getColIndex('实际工时'),
                                rejectedQty: getColIndex('不合格数量'),
                                isCompleted: getColIndex('工序完成')
                              };

                              const dataRows = rawRows.slice(headerIndex + 1);
                              const validRows = dataRows.filter(row => row && row.length > 0 && row[0] !== undefined && String(row[0]).trim() !== '');
                              
                              const formatExcelDate = (val: any) => {
                                if (!val) return '';
                                if (typeof val === 'number') {
                                  // Excel date serial to JS date
                                  const date = new Date(Math.round((val - 25569) * 86400 * 1000));
                                  if (isNaN(date.getTime())) return '';
                                  return date.toISOString().split('T')[0];
                                }
                                return String(val).trim();
                              };

                              // Process in chunks to avoid blocking the UI
                              const chunkSize = 5000;
                              let processedCount = 0;
                              const allFormattedData: any[] = [];

                              const processChunk = () => {
                                const chunk = validRows.slice(processedCount, processedCount + chunkSize);
                                if (chunk.length === 0) {
                                  setDemands(allFormattedData);
                                  addNotification('success', `导入成功！已成功验证并导入 ${allFormattedData.length} 行数据。`);
                                  addSystemMessage({
                                    type: 'success',
                                    title: '大规模数据导入结果',
                                    content: `成功导入 ${allFormattedData.length} 条生产需求数据。系统已自动完成产能负荷分析。`,
                                    category: 'import'
                                  });
                                  setIsImportingDemands(false);
                                  return;
                                }

                                const formattedChunk = chunk.map((row, index) => {
                                  const getValue = (colIdx: number) => colIdx !== -1 ? row[colIdx] : undefined;
                                  
                                  // Store raw row as object for full export
                                  const rawRow: any = {};
                                  headerRow.forEach((header, i) => {
                                    if (header !== undefined && header !== null) {
                                      rawRow[String(header)] = row[i];
                                    }
                                  });

                                  const data = {
                                    id: `dem-import-${Date.now()}-${processedCount + index}`,
                                    orderNo: String(getValue(colMap.orderNo) ?? '').trim(),
                                    workOrderOpNo: String(getValue(colMap.workOrderOpNo) ?? '').trim(),
                                    componentCode: String(getValue(colMap.componentCode) ?? '').trim(),
                                    componentDesc: String(getValue(colMap.componentDesc) ?? '').trim(),
                                    partNumber: String(getValue(colMap.partNumber) ?? '').trim(),
                                    opNo: String(getValue(colMap.opNo) ?? '').trim(),
                                    opCode: String(getValue(colMap.opCode) ?? '').trim(),
                                    opDesc: String(getValue(colMap.opDesc) ?? '').trim(),
                                    resourceGroupId: String(getValue(colMap.resourceGroupId) ?? '').trim(),
                                    resourceGroupDesc: String(getValue(colMap.resourceGroupDesc) ?? '').trim(),
                                    dueDate: formatExcelDate(getValue(colMap.dueDate)),
                                    requiredQty: parseFloat(getValue(colMap.requiredQty)) || 0,
                                    completedQty: parseFloat(getValue(colMap.completedQty)) || 0,
                                    rejectedQty: parseFloat(getValue(colMap.rejectedQty)) || 0,
                                    actualHours: parseFloat(getValue(colMap.actualHours)) || 0,
                                    isCompleted: String(getValue(colMap.isCompleted) ?? '').trim().toUpperCase() === 'TRUE',
                                    rawRow
                                  };
                                  return {
                                    ...data,
                                    original: { ...data }
                                  };
                                });

                                allFormattedData.push(...formattedChunk);
                                processedCount += chunk.length;
                                
                                // Schedule next chunk
                                requestAnimationFrame(processChunk);
                              };

                              // Start processing
                              processChunk();
                            } catch (err) {
                              console.error('Import failed:', err);
                              addNotification('error', '导入失败，请检查文件格式');
                              setIsImportingDemands(false);
                            }
                          };
                          reader.readAsArrayBuffer(file);
                        };
                        input.click();
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-blue-600 rounded-lg transition-all font-medium text-sm"
                    >
                      <Upload size={14} />
                      <span>导入</span>
                    </button>
                    <div className="w-px h-4 bg-slate-300 mx-1" />
                    <button 
                      onClick={async () => {
                        const exportData = analysisResult.scheduledDemands.map(item => {
                          const base = item.rawRow ? { ...item.rawRow } : {
                            '工单号': item.orderNo,
                            '组件物料编码': item.componentCode,
                            '组件描述': item.componentDesc,
                            '料号': item.partNumber || '',
                            '工序号': item.opNo,
                            '工序代码': item.opCode,
                            '工序描述': item.opDesc,
                            '资源组ID': item.resourceGroupId,
                            '交货日期': item.dueDate,
                            '需求数量': item.requiredQty,
                            '完成数量': item.completedQty,
                            '不合格数量': item.rejectedQty || 0,
                            '实际工时': item.actualHours
                          };

                          return {
                            ...base,
                            '工序周期': item.cycleDays || 0,
                            '班组': item.team,
                            '开始生产日期': item.startDate ? new Date(item.startDate).toLocaleDateString('zh-CN') : '-',
                            '未完成数量': Math.max(0, item.uncompletedQty),
                            '需求工时(H)': Number(item.demandHours.toFixed(2)),
                            '备注': item.isOverdue ? '逾期' : '正常'
                          };
                        });

                        const workbook = new ExcelJS.Workbook();
                        const worksheet = workbook.addWorksheet('生产需求-解析');
                        
                        if (exportData.length > 0) {
                          const headers = Object.keys(exportData[0]);
                          const headerRow = worksheet.addRow(headers);
                          headerRow.font = { bold: true };
                          
                          exportData.forEach(data => {
                            worksheet.addRow(Object.values(data));
                          });

                          // Set column width to 5 and add borders
                          worksheet.columns.forEach((col, i) => {
                            col.width = 5;
                          });

                          worksheet.eachRow((row) => {
                            row.eachCell((cell) => {
                              cell.border = {
                                top: { style: 'thin' },
                                left: { style: 'thin' },
                                bottom: { style: 'thin' },
                                right: { style: 'thin' }
                              };
                            });
                          });
                        }

                        const buffer = await workbook.xlsx.writeBuffer();
                        const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
                        const url = window.URL.createObjectURL(blob);
                        const anchor = document.createElement('a');
                        anchor.href = url;
                        anchor.download = `生产需求-解析_${new Date().toISOString().split('T')[0]}.xlsx`;
                        anchor.click();
                        window.URL.revokeObjectURL(url);
                        
                        addNotification('success', '生产需求解析结果已成功导出。');
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-blue-600 hover:bg-white rounded-lg transition-all font-bold text-sm"
                      title="直接导出经系统计算后的解析结果"
                    >
                      <FileText size={14} />
                      <span>导出解析结果</span>
                    </button>
                  </div>
                </div>
              </div>

                <div className="border border-slate-200 rounded-2xl shadow-sm bg-white overflow-hidden relative">
                  {isImportingDemands && (
                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center gap-4">
                      <div className="w-12 h-12 border-4 border-blue-100 border-t-blue-600 rounded-full animate-spin" />
                      <p className="text-slate-600 font-medium">正在导入大规模数据，请稍候...</p>
                    </div>
                  )}
                  
                  {!showDemandsList ? (
                    <div className="flex flex-col items-center justify-center py-24 text-slate-400">
                      <LayoutGrid size={48} className="mb-4 opacity-20" />
                      <p>列表已隐藏以提升系统性能</p>
                      <p className="text-sm mt-2">共 {demands.length} 条数据</p>
                      <button 
                        onClick={() => setShowDemandsList(true)}
                        className="mt-6 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                      >
                        显示列表
                      </button>
                    </div>
                  ) : (
                    <div className="overflow-x-auto custom-scrollbar">
                      <div className="w-fit">
                        {/* Header */}
                        <div className="flex bg-slate-50 border-b border-slate-200 sticky top-0 z-20">
                          <div className="w-[140px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">工单号</div>
                          <div className="w-[200px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">组件物料编码</div>
                          <div className="w-[250px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">组件描述</div>
                          <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">工序号</div>
                          <div className="w-[150px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">工序代码</div>
                          <div className="w-[200px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">工序描述</div>
                          <div className="w-[150px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">资源组ID</div>
                          <div className="w-[140px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200">交货日期</div>
                          <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">需求数量</div>
                          <div className="w-[100px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">完成数量</div>
                          <div className="w-[120px] shrink-0 py-4 px-4 font-bold text-slate-700 border-r border-slate-200 text-right">实际工时</div>
                          {/* Scrollbar spacer */}
                          <div className="w-[15px] shrink-0 bg-slate-50"></div>
                        </div>

                        <FixedSizeList
                          height={600}
                          itemCount={demands.length}
                          itemSize={48}
                          width={1665}
                          className="custom-scrollbar"
                        >
                          {({ index, style }) => {
                            const item = demands[index];
                            return (
                              <div style={style} className="flex border-b border-slate-100 group hover:bg-blue-50/10 transition-colors text-sm">
                                <div className="w-[140px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                                  {item.orderNo}
                                </div>
                                <div className="w-[200px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                                  {item.componentCode}
                                </div>
                                <div className="w-[250px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                                  {item.componentDesc}
                                </div>
                                <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                                  {item.opNo}
                                </div>
                                <div className="w-[150px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                                  {item.opCode}
                                </div>
                                <div className="w-[200px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                                  {item.opDesc}
                                </div>
                                <div className="w-[150px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                                  {item.resourceGroupId}
                                </div>
                                <div className="w-[140px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 truncate">
                                  {item.dueDate}
                                </div>
                                <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right truncate">
                                  {item.requiredQty}
                                </div>
                                <div className="w-[100px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right truncate">
                                  {item.completedQty}
                                </div>
                                <div className="w-[120px] shrink-0 px-4 py-3 border-r border-slate-100 text-slate-700 text-right truncate">
                                  {item.actualHours}
                                </div>
                              </div>
                            );
                          }}
                        </FixedSizeList>
                      </div>
                    </div>
                  )}
                </div>

            </div>
          </div>
        );
      case 'resources':
        return (
          <div className="flex gap-6 max-w-7xl mx-auto items-start">
            <div className="flex-1 glass-card p-8 overflow-hidden">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Network size={22} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">资源分组</h3>
                    <p className="text-sm text-slate-500">共 {resources.length} 条记录</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text"
                      placeholder="搜索资源组ID或描述..."
                      value={searchResource}
                      onChange={(e) => setSearchResource(e.target.value)}
                      className="pl-10 pr-10 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-emerald-500/20 w-64 transition-all outline-none"
                    />
                    {searchResource && (
                      <button 
                        onClick={() => setSearchResource('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Clear Action */}
                  <button 
                    onClick={() => {
                      if (isConfirmingClearResources) {
                        setResources([]);
                        setSearchResource('');
                        setSelectedTeams([]);
                        setIsConfirmingClearResources(false);
                      } else {
                        setIsConfirmingClearResources(true);
                        setTimeout(() => setIsConfirmingClearResources(false), 3000);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all border text-sm",
                      isConfirmingClearResources 
                        ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100 animate-pulse" 
                        : "bg-white text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-100 hover:bg-red-50"
                    )}
                  >
                    <Trash2 size={16} />
                    <span>{isConfirmingClearResources ? '确认清空?' : '清空'}</span>
                  </button>

                  <div className="h-6 w-px bg-slate-200 mx-1" />

                  {/* Data Management Group */}
                  <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
                    <button 
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.csv,.xlsx,.xls';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;

                          const reader = new FileReader();
                          reader.onload = (event) => {
                            try {
                              const arrayBuffer = event.target?.result as ArrayBuffer;
                              let workbook;
                              
                              if (file.name.toLowerCase().endsWith('.csv')) {
                                let text;
                                try {
                                  const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                                  text = utf8Decoder.decode(arrayBuffer);
                                } catch (e) {
                                  const gbkDecoder = new TextDecoder('gbk');
                                  text = gbkDecoder.decode(arrayBuffer);
                                }
                                workbook = XLSX.read(text, { type: 'string' });
                              } else {
                                workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
                              }
                              
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                              
                              if (rawRows.length === 0) {
                                addNotification('error', '文件内容为空');
                                return;
                              }

                              let headerIndex = -1;
                              const requiredKeywords = ['资源组ID', '资源组描述', '班组', '车间'];
                              
                              for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                                const row = rawRows[i];
                                if (!row) continue;
                                const rowText = row.join('|');
                                const matchCount = requiredKeywords.filter(kw => rowText.includes(kw)).length;
                                if (matchCount >= 2) {
                                  headerIndex = i;
                                  break;
                                }
                              }

                              if (headerIndex === -1) {
                                addNotification('error', '验证失败：未找到包含“资源组ID”、“资源组描述”、“班组”或“车间”等关键词的表头。');
                                return;
                              }

                              const dataRows = rawRows.slice(headerIndex + 1);
                              const validRows = dataRows.filter(row => row && row.length > 0 && row[0] !== undefined && String(row[0]).trim() !== '');
                              
                              if (validRows.length === 0) {
                                addNotification('error', '未检测到有效的资源数据行');
                                return;
                              }

                              const formattedData = validRows.map((row, index) => {
                                const data = {
                                  id: String(row[0]).trim() || `res-import-${Date.now()}-${index}`,
                                  groupName: String(row[1]).trim() || '未知资源组',
                                  team: String(row[2]).trim() || '',
                                  workshop: String(row[3]).trim() || ''
                                };
                                return {
                                  ...data,
                                  original: {
                                    id: data.id,
                                    groupName: data.groupName,
                                    team: data.team,
                                    workshop: data.workshop
                                  }
                                };
                              });

                              setResources(formattedData);
                              setSelectedTeams([]);
                              addNotification('success', `导入成功！已成功验证并导入 ${formattedData.length} 行数据。`);
                            } catch (err) {
                              console.error('Import failed:', err);
                              addNotification('error', '导入失败，请检查文件格式');
                            }
                          };
                          reader.readAsArrayBuffer(file);
                        };
                        input.click();
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-emerald-600 rounded-lg transition-all font-medium text-sm"
                    >
                      <Upload size={14} />
                      <span>导入</span>
                    </button>
                    <button 
                      onClick={() => {
                        const exportData = resources.map(item => ({
                          '资源组ID': item.id,
                          '资源组描述': item.groupName,
                          '班组': item.team,
                          '车间': item.workshop
                        }));
                        
                        const worksheet = XLSX.utils.json_to_sheet(exportData);
                        
                        // Optimize column widths
                        if (exportData.length > 0) {
                          const keys = Object.keys(exportData[0]);
                          worksheet['!cols'] = keys.map(key => {
                            const headerLen = key.toString().split('').reduce((acc, char) => acc + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
                            let maxLen = headerLen;
                            exportData.forEach(row => {
                              const val = (row as any)[key];
                              if (val !== null && val !== undefined) {
                                const str = val.toString();
                                const len = str.split('').reduce((acc, char) => acc + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
                                if (len > maxLen) maxLen = len;
                              }
                            });
                            return { wch: Math.min(maxLen + 2, 50) };
                          });
                        }

                        const workbook = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(workbook, worksheet, "资源分组");
                        XLSX.writeFile(workbook, `资源分组明细_${new Date().toISOString().split('T')[0]}.xlsx`);
                        addNotification('success', '资源分组明细已成功导出。');
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-emerald-600 rounded-lg transition-all font-medium text-sm"
                    >
                      <Download size={14} />
                      <span>导出</span>
                    </button>
                  </div>

                  {/* Primary Action */}
                  <button 
                    onClick={() => {
                      setResources([{ 
                        id: '', 
                        groupName: '', 
                        team: '',
                        workshop: ''
                      }, ...resources]);
                    }}
                    className="flex items-center gap-2 px-5 py-2 bg-emerald-600 text-white rounded-xl font-semibold shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all active:scale-95 text-sm"
                  >
                    <Plus size={18} />
                    添加资源组
                  </button>
                </div>
              </div>

              <div className="overflow-auto max-h-[650px] border border-slate-200 rounded-2xl shadow-sm bg-white">
                <table className="w-full text-sm text-left border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-50">
                      <th className="py-4 px-4 font-bold text-left border-b border-r border-slate-200 text-slate-700 w-1/4">
                        <div className="flex items-center gap-2">
                          <Hash size={16} className="text-slate-400" />
                          资源组ID
                        </div>
                      </th>
                      <th className="py-4 px-4 font-bold text-left border-b border-r border-slate-200 text-slate-700 w-1/4">
                        <div className="flex items-center gap-2">
                          <LayoutGrid size={16} className="text-slate-400" />
                          资源组描述
                        </div>
                      </th>
                      <th className="py-4 px-4 font-bold text-left border-b border-r border-slate-200 text-slate-700 w-1/4">
                        <div className="flex items-center gap-2">
                          <LayoutGrid size={16} className="text-slate-400" />
                          班组
                        </div>
                      </th>
                      <th className="py-4 px-4 font-bold text-left border-b border-r border-slate-200 text-slate-700 w-1/4">
                        <div className="flex items-center gap-2">
                          <LayoutGrid size={16} className="text-slate-400" />
                          车间
                        </div>
                      </th>
                      <th className="py-4 px-4 w-14 border-b border-r border-slate-200 bg-slate-50"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredResources.map((item) => {
                      const rowModified = isRowModified(item);
                      const originalIdx = resources.findIndex(r => r.id === item.id);
                      return (
                        <tr key={item.id} className={cn(
                          "group transition-all duration-200",
                          rowModified ? "bg-amber-50/30 hover:bg-amber-50/50" : "hover:bg-emerald-50/10"
                        )}>
                          <td className={cn(
                            "py-3 px-4 border-r border-slate-100 transition-colors",
                            rowModified ? "bg-amber-50/50 group-hover:bg-amber-50/60" : "bg-white group-hover:bg-emerald-50/20",
                            isFieldModified(item, 'id') ? "text-amber-600" : "text-slate-700"
                          )}>
                            <div className="flex items-center gap-2">
                              {isFieldModified(item, 'id') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                              <input 
                                type="text" 
                                value={item.id}
                                onChange={(e) => {
                                  const newRes = [...resources];
                                  newRes[originalIdx].id = e.target.value;
                                  setResources(newRes);
                                }}
                                placeholder="资源组ID"
                                className="bg-transparent border-none focus:ring-2 focus:ring-emerald-500/20 rounded px-2 py-1 w-full transition-all outline-none placeholder:text-slate-400 placeholder:font-normal"
                                title={item.original ? `原始值: ${item.original.id}` : undefined}
                              />
                            </div>
                          </td>
                          <td className={cn(
                            "py-3 px-4 border-r border-slate-100 transition-colors",
                            isFieldModified(item, 'groupName') ? "bg-amber-50/50 text-amber-600" : "text-slate-700"
                          )}>
                            <div className="flex items-center gap-2">
                              {isFieldModified(item, 'groupName') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                              <input 
                                type="text" 
                                value={item.groupName}
                                onChange={(e) => {
                                  const newRes = [...resources];
                                  newRes[originalIdx].groupName = e.target.value;
                                  setResources(newRes);
                                }}
                                placeholder="资源组描述"
                                className="bg-transparent border-none focus:ring-2 focus:ring-emerald-500/20 rounded px-2 py-1 w-full transition-all outline-none placeholder:text-slate-400 placeholder:font-normal"
                                title={item.original ? `原始值: ${item.original.groupName}` : undefined}
                              />
                            </div>
                          </td>
                          <td className={cn(
                            "py-3 px-4 border-r border-slate-100 transition-colors",
                            isFieldModified(item, 'team') ? "bg-amber-50/50 text-amber-600" : "text-slate-700"
                          )}>
                            <div className="flex items-center gap-2">
                              {isFieldModified(item, 'team') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                              <Combobox 
                                value={item.team}
                                onChange={(val) => {
                                  const newRes = [...resources];
                                  newRes[originalIdx].team = val;
                                  setResources(newRes);
                                }}
                                options={Array.from(new Set(resources.map(r => r.team).filter(Boolean)))}
                                title={item.original ? `原始值: ${item.original.team}` : undefined}
                                placeholder="班组"
                              />
                            </div>
                          </td>
                          <td className={cn(
                            "py-3 px-4 border-r border-slate-100 transition-colors",
                            isFieldModified(item, 'workshop') ? "bg-amber-50/50 text-amber-600" : "text-slate-700"
                          )}>
                            <div className="flex items-center gap-2">
                              {isFieldModified(item, 'workshop') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                              <input 
                                type="text" 
                                value={item.workshop}
                                onChange={(e) => {
                                  const newRes = [...resources];
                                  newRes[originalIdx].workshop = e.target.value;
                                  setResources(newRes);
                                }}
                                placeholder="车间"
                                className="bg-transparent border-none focus:ring-2 focus:ring-emerald-500/20 rounded px-2 py-1 w-full transition-all outline-none placeholder:text-slate-400 placeholder:font-normal"
                                title={item.original ? `原始值: ${item.original.workshop}` : undefined}
                              />
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right border-r border-slate-100">
                            <div className="flex items-center justify-end gap-1">
                              {rowModified && (
                                <button 
                                  onClick={() => restoreRow(originalIdx, 'resource')}
                                  className="p-1.5 text-amber-500 hover:bg-amber-100 rounded-lg transition-all"
                                  title="恢复原始数据"
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                              <button 
                                onClick={() => setResources(resources.filter(r => r.id !== item.id))}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                title="删除资源组"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Right Sidebar - Team Filter */}
            <div className="w-64 shrink-0 glass-card p-6 sticky top-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold text-slate-800 flex items-center gap-2">
                  <Filter size={18} className="text-emerald-600" />
                  班组筛选
                </h3>
                {selectedTeams.length > 0 && (
                  <button 
                    onClick={() => setSelectedTeams([])}
                    className="text-xs text-slate-500 hover:text-emerald-600 transition-colors"
                  >
                    清除
                  </button>
                )}
              </div>
              
              <div className="space-y-2 max-h-[calc(100vh-250px)] overflow-y-auto pr-2 custom-scrollbar">
                {uniqueTeams.length === 0 ? (
                  <div className="text-sm text-slate-500 text-center py-4">暂无班组数据</div>
                ) : (
                  uniqueTeams.map(team => (
                    <label key={team} className="flex items-center gap-3 p-2 hover:bg-slate-50 rounded-lg cursor-pointer transition-colors group">
                      <div className="relative flex items-center justify-center">
                        <input 
                          type="checkbox" 
                          className="peer appearance-none w-4 h-4 border-2 border-slate-300 rounded-sm checked:bg-emerald-500 checked:border-emerald-500 transition-colors cursor-pointer"
                          checked={selectedTeams.includes(team)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedTeams(prev => [...prev, team]);
                            } else {
                              setSelectedTeams(prev => prev.filter(t => t !== team));
                            }
                          }}
                        />
                        <Check size={12} className="absolute text-white opacity-0 peer-checked:opacity-100 pointer-events-none" strokeWidth={3} />
                      </div>
                      <span className="text-sm text-slate-700 group-hover:text-slate-900">{team || '未命名班组'}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      case 'standard-time':
        return (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="glass-card p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <Timer size={22} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">标准工时</h3>
                    <p className="text-sm text-slate-500">共 {standardTimes.length} 条记录</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text"
                      placeholder="搜索班组名称..."
                      value={searchStandardTime}
                      onChange={(e) => setSearchStandardTime(e.target.value)}
                      className="pl-10 pr-10 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-indigo-500/20 w-64 transition-all outline-none"
                    />
                    {searchStandardTime && (
                      <button 
                        onClick={() => setSearchStandardTime('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Clear Action */}
                  <button 
                    onClick={() => {
                      if (isConfirmingClear) {
                        setStandardTimes([]);
                        setSearchStandardTime('');
                        setIsConfirmingClear(false);
                      } else {
                        setIsConfirmingClear(true);
                        setTimeout(() => setIsConfirmingClear(false), 3000);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all border text-sm",
                      isConfirmingClear 
                        ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100 animate-pulse" 
                        : "bg-white text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-100 hover:bg-red-50"
                    )}
                  >
                    <Trash2 size={16} />
                    <span>{isConfirmingClear ? '确认清空?' : '清空'}</span>
                  </button>

                  <div className="h-6 w-px bg-slate-200 mx-1" />

                  {/* Data Management Group */}
                  <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
                    <button 
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.csv,.xlsx,.xls';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;

                          const reader = new FileReader();
                          reader.onload = (event) => {
                            try {
                              const arrayBuffer = event.target?.result as ArrayBuffer;
                              let workbook;
                              
                              if (file.name.toLowerCase().endsWith('.csv')) {
                                let text;
                                try {
                                  const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                                  text = utf8Decoder.decode(arrayBuffer);
                                } catch (e) {
                                  const gbkDecoder = new TextDecoder('gbk');
                                  text = gbkDecoder.decode(arrayBuffer);
                                }
                                workbook = XLSX.read(text, { type: 'string' });
                              } else {
                                workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
                              }
                              
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                              
                              if (rawRows.length === 0) {
                                addNotification('error', '文件内容为空');
                                return;
                              }

                              // 1. Find Header Row and Validate
                              let headerIndex = -1;
                              const requiredKeywords = ['班组', '人员', '设备'];
                              
                              for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                                const row = rawRows[i];
                                if (!row) continue;
                                
                                const rowText = row.join('|');
                                const matchCount = requiredKeywords.filter(kw => rowText.includes(kw)).length;
                                
                                // If at least 2 keywords match, we consider this the header row
                                if (matchCount >= 2) {
                                  headerIndex = i;
                                  break;
                                }
                              }

                              if (headerIndex === -1) {
                                addNotification('error', '验证失败：未找到包含“班组”、“人员”、“设备”等关键词的表头。');
                                return;
                              }

                              // 2. Extract Data
                              const dataRows = rawRows.slice(headerIndex + 1);
                              const validRows = dataRows.filter(row => row && row.length > 0 && row[0] !== undefined && String(row[0]).trim() !== '');
                              
                              if (validRows.length === 0) {
                                addNotification('error', '未检测到有效的班组数据行');
                                return;
                              }

                              const formattedData = validRows.map((row, index) => {
                                const data = {
                                  id: `import-${Date.now()}-${index}`,
                                  groupName: String(row[0]).trim() || '未知班组',
                                  peopleCount: parseFloat(row[1]) || 0,
                                  peopleShifts: parseFloat(row[2]) || 1,
                                  peopleDuration: parseFloat(row[3]) || 8,
                                  peopleOee: parseFloat(row[4]) || 0.85,
                                  machineCount: parseFloat(row[5]) || 0,
                                  machineShifts: parseFloat(row[6]) || 1,
                                  machineDuration: parseFloat(row[7]) || 8,
                                  machineOee: parseFloat(row[8]) || 0.85
                                };
                                return {
                                  ...data,
                                  original: {
                                    groupName: data.groupName,
                                    peopleCount: data.peopleCount,
                                    peopleShifts: data.peopleShifts,
                                    peopleDuration: data.peopleDuration,
                                    peopleOee: data.peopleOee,
                                    machineCount: data.machineCount,
                                    machineShifts: data.machineShifts,
                                    machineDuration: data.machineDuration,
                                    machineOee: data.machineOee
                                  }
                                };
                              });

                              setStandardTimes(formattedData);
                              addNotification('success', `导入成功！已成功验证并导入 ${formattedData.length} 行数据。`);
                            } catch (err) {
                              console.error('Import failed:', err);
                              addNotification('error', '导入失败，请检查文件格式');
                            }
                          };
                          reader.readAsArrayBuffer(file);
                        };
                        input.click();
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm"
                    >
                      <Upload size={14} />
                      <span>导入</span>
                    </button>
                    <button 
                      onClick={() => {
                        const exportData = standardTimes.map(item => ({
                          '班组名称': item.groupName,
                          '人员数量': item.peopleCount,
                          '人员班次': item.peopleShifts,
                          '人员时长(H)': item.peopleDuration,
                          '人员OEE': item.peopleOee,
                          '设备数量': item.machineCount,
                          '设备班次': item.machineShifts,
                          '设备时长(H)': item.machineDuration,
                          '设备OEE': item.machineOee
                        }));
                        
                        const worksheet = XLSX.utils.json_to_sheet(exportData);
                        
                        // Optimize column widths
                        if (exportData.length > 0) {
                          const keys = Object.keys(exportData[0]);
                          worksheet['!cols'] = keys.map(key => {
                            const headerLen = key.toString().split('').reduce((acc, char) => acc + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
                            let maxLen = headerLen;
                            exportData.forEach(row => {
                              const val = (row as any)[key];
                              if (val !== null && val !== undefined) {
                                const str = val.toString();
                                const len = str.split('').reduce((acc, char) => acc + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
                                if (len > maxLen) maxLen = len;
                              }
                            });
                            return { wch: Math.min(maxLen + 2, 50) };
                          });
                        }

                        const workbook = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(workbook, worksheet, "标准工时");
                        XLSX.writeFile(workbook, `标准工时明细_${new Date().toISOString().split('T')[0]}.xlsx`);
                        addNotification('success', '标准工时明细已成功导出。');
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-indigo-600 rounded-lg transition-all font-medium text-sm"
                    >
                      <Download size={14} />
                      <span>导出</span>
                    </button>
                  </div>

                  {/* Primary Action */}
                  <button 
                    onClick={() => {
                      const newId = Math.random().toString(36).substr(2, 9);
                      setStandardTimes([{ 
                        id: newId, 
                        groupName: '', 
                        peopleCount: '' as any, 
                        peopleShifts: '' as any, 
                        peopleDuration: '' as any, 
                        peopleOee: '' as any,
                        machineCount: '' as any,
                        machineShifts: '' as any,
                        machineDuration: '' as any,
                        machineOee: '' as any
                      }, ...standardTimes]);
                    }}
                    className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-xl font-semibold shadow-lg shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95 text-sm"
                  >
                    <Plus size={18} />
                    添加班组
                  </button>
                </div>
              </div>

              <div className="overflow-auto max-h-[650px] border border-slate-200 rounded-2xl shadow-sm bg-white">
                <table className="w-full text-sm text-left border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-50">
                      <th rowSpan={2} className="py-5 px-4 font-bold text-slate-600 border-b border-r border-slate-200 min-w-[160px] sticky left-0 z-30 bg-slate-50">
                        <div className="flex items-center gap-2">
                          <LayoutGrid size={16} className="text-slate-400" />
                          <span>班组名称</span>
                        </div>
                      </th>
                      <th colSpan={4} className="py-3 font-bold text-center border-b border-r border-slate-200 text-indigo-600 bg-indigo-50/50">
                        人员
                      </th>
                      <th colSpan={4} className="py-3 font-bold text-center border-b border-r border-slate-200 text-emerald-600 bg-emerald-50/50">
                        设备
                      </th>
                      <th rowSpan={2} className="py-5 px-4 w-14 border-b border-r border-slate-200 bg-slate-50"></th>
                    </tr>
                    <tr className="bg-slate-50">
                      <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">数量</th>
                      <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">班次</th>
                      <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">时长(H)</th>
                      <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">OEE</th>
                      <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">数量</th>
                      <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">班次</th>
                      <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">时长(H)</th>
                      <th className="py-3 px-2 font-bold text-center border-b border-r border-slate-200 text-slate-500 bg-slate-50">OEE</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredStandardTimes.map((item) => {
                      const rowModified = isRowModified(item);
                      const originalIdx = standardTimes.findIndex(st => st.id === item.id);
                      return (
                        <tr key={item.id} className={cn(
                          "group transition-all duration-200",
                          rowModified ? "bg-amber-50/30 hover:bg-amber-50/50" : "hover:bg-indigo-50/20"
                        )}>
                          <td className={cn(
                            "py-3 px-4 font-semibold border-r border-slate-100 sticky left-0 z-10 transition-colors",
                            rowModified ? "bg-amber-50/50 group-hover:bg-amber-50/60" : "bg-white group-hover:bg-indigo-50/30",
                            isFieldModified(item, 'groupName') ? "text-amber-600" : "text-slate-700"
                          )}>
                            <div className="flex items-center gap-2">
                              {isFieldModified(item, 'groupName') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                              <input 
                                type="text" 
                                value={item.groupName}
                                onChange={(e) => {
                                  const newTimes = [...standardTimes];
                                  newTimes[originalIdx].groupName = e.target.value;
                                  setStandardTimes(newTimes);
                                }}
                                placeholder="班组名称"
                                className="bg-transparent border-none focus:ring-2 focus:ring-indigo-500/20 rounded px-2 py-1 w-full font-semibold transition-all outline-none placeholder:text-slate-400 placeholder:font-normal"
                                title={item.original ? `原始值: ${item.original.groupName}` : undefined}
                              />
                            </div>
                          </td>
                          {/* People Section */}
                          <td className={cn("py-3 px-1 border-r border-slate-100", isFieldModified(item, 'peopleCount') && "bg-amber-50/50")}>
                            <input 
                              type="number" 
                              value={item.peopleCount === '' as any ? '' : item.peopleCount}
                              onChange={(e) => {
                                const newTimes = [...standardTimes];
                                newTimes[originalIdx].peopleCount = e.target.value === '' ? '' as any : parseFloat(e.target.value) || 0;
                                setStandardTimes(newTimes);
                              }}
                              placeholder="数量"
                              className={cn(
                                "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:text-slate-300 placeholder:font-sans",
                                isFieldModified(item, 'peopleCount') ? "text-amber-600 font-bold" : "text-slate-600"
                              )}
                              title={item.original ? `原始值: ${item.original.peopleCount}` : undefined}
                            />
                          </td>
                          <td className={cn("py-3 px-1 border-r border-slate-100", isFieldModified(item, 'peopleShifts') && "bg-amber-50/50")}>
                            <input 
                              type="number" 
                              value={item.peopleShifts === '' as any ? '' : item.peopleShifts}
                              onChange={(e) => {
                                const newTimes = [...standardTimes];
                                newTimes[originalIdx].peopleShifts = e.target.value === '' ? '' as any : parseFloat(e.target.value) || 0;
                                setStandardTimes(newTimes);
                              }}
                              placeholder="班次"
                              className={cn(
                                "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:text-slate-300 placeholder:font-sans",
                                isFieldModified(item, 'peopleShifts') ? "text-amber-600 font-bold" : "text-slate-600"
                              )}
                              title={item.original ? `原始值: ${item.original.peopleShifts}` : undefined}
                            />
                          </td>
                          <td className={cn("py-3 px-1 border-r border-slate-100", isFieldModified(item, 'peopleDuration') && "bg-amber-50/50")}>
                            <input 
                              type="number" 
                              value={item.peopleDuration === '' as any ? '' : item.peopleDuration}
                              onChange={(e) => {
                                const newTimes = [...standardTimes];
                                newTimes[originalIdx].peopleDuration = e.target.value === '' ? '' as any : parseFloat(e.target.value) || 0;
                                setStandardTimes(newTimes);
                              }}
                              placeholder="时长"
                              className={cn(
                                "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:text-slate-300 placeholder:font-sans",
                                isFieldModified(item, 'peopleDuration') ? "text-amber-600 font-bold" : "text-slate-600"
                              )}
                              title={item.original ? `原始值: ${item.original.peopleDuration}` : undefined}
                            />
                          </td>
                          <td className={cn("py-3 px-1 border-r border-slate-100", isFieldModified(item, 'peopleOee') && "bg-amber-50/50")}>
                            <input 
                              type="number" 
                              step="0.01"
                              value={item.peopleOee === '' as any ? '' : item.peopleOee}
                              onChange={(e) => {
                                const newTimes = [...standardTimes];
                                newTimes[originalIdx].peopleOee = e.target.value === '' ? '' as any : parseFloat(e.target.value) || 0;
                                setStandardTimes(newTimes);
                              }}
                              placeholder="OEE"
                              className={cn(
                                "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-indigo-500/20 rounded py-1 font-mono transition-all outline-none placeholder:text-slate-300 placeholder:font-sans",
                                isFieldModified(item, 'peopleOee') ? "text-amber-600 font-bold" : "text-indigo-600 font-medium"
                              )}
                              title={item.original ? `原始值: ${item.original.peopleOee}` : undefined}
                            />
                          </td>
                          {/* Machine Section */}
                          <td className={cn("py-3 px-1 border-r border-slate-100 bg-emerald-50/5 group-hover:bg-emerald-50/10 transition-colors", isFieldModified(item, 'machineCount') && "bg-amber-50/50")}>
                            <input 
                              type="number" 
                              value={item.machineCount === '' as any ? '' : item.machineCount}
                              onChange={(e) => {
                                const newTimes = [...standardTimes];
                                newTimes[originalIdx].machineCount = e.target.value === '' ? '' as any : parseFloat(e.target.value) || 0;
                                setStandardTimes(newTimes);
                              }}
                              placeholder="数量"
                              className={cn(
                                "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-emerald-500/20 rounded py-1 font-mono transition-all outline-none placeholder:text-slate-300 placeholder:font-sans",
                                isFieldModified(item, 'machineCount') ? "text-amber-600 font-bold" : "text-slate-600"
                              )}
                              title={item.original ? `原始值: ${item.original.machineCount}` : undefined}
                            />
                          </td>
                          <td className={cn("py-3 px-1 border-r border-slate-100 bg-emerald-50/5 group-hover:bg-emerald-50/10 transition-colors", isFieldModified(item, 'machineShifts') && "bg-amber-50/50")}>
                            <input 
                              type="number" 
                              value={item.machineShifts === '' as any ? '' : item.machineShifts}
                              onChange={(e) => {
                                const newTimes = [...standardTimes];
                                newTimes[originalIdx].machineShifts = e.target.value === '' ? '' as any : parseFloat(e.target.value) || 0;
                                setStandardTimes(newTimes);
                              }}
                              placeholder="班次"
                              className={cn(
                                "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-emerald-500/20 rounded py-1 font-mono transition-all outline-none placeholder:text-slate-300 placeholder:font-sans",
                                isFieldModified(item, 'machineShifts') ? "text-amber-600 font-bold" : "text-slate-600"
                              )}
                              title={item.original ? `原始值: ${item.original.machineShifts}` : undefined}
                            />
                          </td>
                          <td className={cn("py-3 px-1 border-r border-slate-100 bg-emerald-50/5 group-hover:bg-emerald-50/10 transition-colors", isFieldModified(item, 'machineDuration') && "bg-amber-50/50")}>
                            <input 
                              type="number" 
                              value={item.machineDuration === '' as any ? '' : item.machineDuration}
                              onChange={(e) => {
                                const newTimes = [...standardTimes];
                                newTimes[originalIdx].machineDuration = e.target.value === '' ? '' as any : parseFloat(e.target.value) || 0;
                                setStandardTimes(newTimes);
                              }}
                              placeholder="时长"
                              className={cn(
                                "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-emerald-500/20 rounded py-1 font-mono transition-all outline-none placeholder:text-slate-300 placeholder:font-sans",
                                isFieldModified(item, 'machineDuration') ? "text-amber-600 font-bold" : "text-slate-600"
                              )}
                              title={item.original ? `原始值: ${item.original.machineDuration}` : undefined}
                            />
                          </td>
                          <td className={cn("py-3 px-1 border-r border-slate-100 bg-emerald-50/5 group-hover:bg-emerald-50/10 transition-colors", isFieldModified(item, 'machineOee') && "bg-amber-50/50")}>
                            <input 
                              type="number" 
                              step="0.01"
                              value={item.machineOee === '' as any ? '' : item.machineOee}
                              onChange={(e) => {
                                const newTimes = [...standardTimes];
                                newTimes[originalIdx].machineOee = e.target.value === '' ? '' as any : parseFloat(e.target.value) || 0;
                                setStandardTimes(newTimes);
                              }}
                              placeholder="OEE"
                              className={cn(
                                "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-emerald-500/20 rounded py-1 font-mono transition-all outline-none placeholder:text-slate-300 placeholder:font-sans",
                                isFieldModified(item, 'machineOee') ? "text-amber-600 font-bold" : "text-emerald-600 font-medium"
                              )}
                              title={item.original ? `原始值: ${item.original.machineOee}` : undefined}
                            />
                          </td>
                          <td className="py-3 px-4 text-right border-r border-slate-100">
                            <div className="flex items-center justify-end gap-1">
                              {rowModified && (
                                <button 
                                  onClick={() => restoreRow(originalIdx, 'standard')}
                                  className="p-1.5 text-amber-500 hover:bg-amber-100 rounded-lg transition-all"
                                  title="恢复原始数据"
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                              <button 
                                onClick={() => setStandardTimes(standardTimes.filter(t => t.id !== item.id))}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                title="删除班组"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      case 'process-cycle':
        return (
          <div className="space-y-6 max-w-5xl mx-auto">
            <div className="glass-card p-8">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <Clock size={22} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">工序周期</h3>
                    <p className="text-sm text-slate-500">共 {processCycles.length} 条记录</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                    <input 
                      type="text"
                      placeholder="搜索工序或描述..."
                      value={searchProcessCycle}
                      onChange={(e) => setSearchProcessCycle(e.target.value)}
                      className="pl-10 pr-10 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-amber-500/20 w-64 transition-all outline-none"
                    />
                    {searchProcessCycle && (
                      <button 
                        onClick={() => setSearchProcessCycle('')}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </div>

                  {/* Clear Action */}
                  <button 
                    onClick={() => {
                      if (isConfirmingClearProcessCycles) {
                        setProcessCycles([]);
                        setSearchProcessCycle('');
                        setIsConfirmingClearProcessCycles(false);
                      } else {
                        setIsConfirmingClearProcessCycles(true);
                        setTimeout(() => setIsConfirmingClearProcessCycles(false), 3000);
                      }
                    }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-all border text-sm",
                      isConfirmingClearProcessCycles 
                        ? "bg-red-600 text-white border-red-600 shadow-lg shadow-red-100 animate-pulse" 
                        : "bg-white text-slate-400 border-slate-200 hover:text-red-500 hover:border-red-100 hover:bg-red-50"
                    )}
                  >
                    <Trash2 size={16} />
                    <span>{isConfirmingClearProcessCycles ? '确认清空?' : '清空'}</span>
                  </button>

                  <div className="h-6 w-px bg-slate-200 mx-1" />

                  {/* Data Management Group */}
                  <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/50">
                    <button 
                      onClick={() => {
                        const input = document.createElement('input');
                        input.type = 'file';
                        input.accept = '.csv,.xlsx,.xls';
                        input.onchange = (e) => {
                          const file = (e.target as HTMLInputElement).files?.[0];
                          if (!file) return;

                          const reader = new FileReader();
                          reader.onload = (event) => {
                            try {
                              const arrayBuffer = event.target?.result as ArrayBuffer;
                              let workbook;
                              
                              if (file.name.toLowerCase().endsWith('.csv')) {
                                let text;
                                try {
                                  const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
                                  text = utf8Decoder.decode(arrayBuffer);
                                } catch (e) {
                                  const gbkDecoder = new TextDecoder('gbk');
                                  text = gbkDecoder.decode(arrayBuffer);
                                }
                                workbook = XLSX.read(text, { type: 'string' });
                              } else {
                                workbook = XLSX.read(new Uint8Array(arrayBuffer), { type: 'array' });
                              }
                              
                              const sheetName = workbook.SheetNames[0];
                              const worksheet = workbook.Sheets[sheetName];
                              const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                              
                              if (rawRows.length === 0) {
                                addNotification('error', '文件内容为空');
                                return;
                              }

                              // 1. Find Header Row and Validate
                              let headerIndex = -1;
                              const requiredKeywords = ['工序', '编号', '名称', '周期'];
                              
                              for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
                                const row = rawRows[i];
                                if (!row) continue;
                                
                                const rowText = row.join('|');
                                const matchCount = requiredKeywords.filter(kw => rowText.includes(kw)).length;
                                
                                // If at least 2 keywords match, we consider this the header row
                                if (matchCount >= 2) {
                                  headerIndex = i;
                                  break;
                                }
                              }

                              if (headerIndex === -1) {
                                addNotification('error', '验证失败：未找到包含“工序”、“工序描述”、“工序周期”等关键词的表头。');
                                return;
                              }

                              // 2. Extract Data
                              const dataRows = rawRows.slice(headerIndex + 1);
                              const validRows = dataRows.filter(row => row && row.length > 0 && row[0] !== undefined && String(row[0]).trim() !== '');
                              
                              if (validRows.length === 0) {
                                addNotification('error', '未检测到有效的工序数据行');
                                return;
                              }

                              const formattedData = validRows.map((row, index) => {
                                const data = {
                                  id: `import-pc-${Date.now()}-${index}`,
                                  opCode: String(row[0]).trim() || '',
                                  opName: String(row[1]).trim() || '',
                                  cycleDays: Math.round(parseFloat(row[2])) || 0
                                };
                                return {
                                  ...data,
                                  original: {
                                    opCode: data.opCode,
                                    opName: data.opName,
                                    cycleDays: data.cycleDays
                                  }
                                };
                              });

                              setProcessCycles(formattedData);
                              addNotification('success', `导入成功！已成功验证并导入 ${formattedData.length} 行数据。`);
                            } catch (err) {
                              console.error('Import failed:', err);
                              addNotification('error', '导入失败，请检查文件格式');
                            }
                          };
                          reader.readAsArrayBuffer(file);
                        };
                        input.click();
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-amber-600 rounded-lg transition-all font-medium text-sm"
                    >
                      <Upload size={14} />
                      <span>导入</span>
                    </button>
                    <button 
                      onClick={() => {
                        const exportData = processCycles.map(item => ({
                          '工序': item.opCode,
                          '工序描述': item.opName,
                          '工序周期（天）': item.cycleDays
                        }));
                        
                        const worksheet = XLSX.utils.json_to_sheet(exportData);
                        
                        // Optimize column widths
                        if (exportData.length > 0) {
                          const keys = Object.keys(exportData[0]);
                          worksheet['!cols'] = keys.map(key => {
                            const headerLen = key.toString().split('').reduce((acc, char) => acc + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
                            let maxLen = headerLen;
                            exportData.forEach(row => {
                              const val = (row as any)[key];
                              if (val !== null && val !== undefined) {
                                const str = val.toString();
                                const len = str.split('').reduce((acc, char) => acc + (char.charCodeAt(0) > 255 ? 2 : 1), 0);
                                if (len > maxLen) maxLen = len;
                              }
                            });
                            return { wch: Math.min(maxLen + 2, 50) };
                          });
                        }

                        const workbook = XLSX.utils.book_new();
                        XLSX.utils.book_append_sheet(workbook, worksheet, "工序周期");
                        XLSX.writeFile(workbook, `工序周期明细_${new Date().toISOString().split('T')[0]}.xlsx`);
                        addNotification('success', '工序周期明细已成功导出。');
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-slate-600 hover:bg-white hover:text-amber-600 rounded-lg transition-all font-medium text-sm"
                    >
                      <Download size={14} />
                      <span>导出</span>
                    </button>
                  </div>

                  {/* Primary Action */}
                  <button 
                    onClick={() => {
                      const newId = Math.random().toString(36).substr(2, 9);
                      setProcessCycles([{ 
                        id: newId, 
                        opCode: '', 
                        opName: '', 
                        cycleDays: 0
                      }, ...processCycles]);
                    }}
                    className="flex items-center gap-2 px-5 py-2 bg-amber-600 text-white rounded-xl font-semibold shadow-lg shadow-amber-200 hover:bg-amber-700 transition-all active:scale-95 text-sm"
                  >
                    <Plus size={18} />
                    添加工序
                  </button>
                </div>
              </div>

              <div className="overflow-auto max-h-[650px] border border-slate-200 rounded-2xl shadow-sm bg-white">
                <table className="w-full text-sm text-left border-separate border-spacing-0">
                  <thead className="sticky top-0 z-20">
                    <tr className="bg-slate-50">
                      <th className="py-4 px-4 font-bold text-slate-600 border-b border-r border-slate-200 min-w-[150px] bg-slate-50">
                        <div className="flex items-center gap-2">
                          <Hash size={16} className="text-slate-400" />
                          <span>工序</span>
                        </div>
                      </th>
                      <th className="py-4 px-4 font-bold text-slate-600 border-b border-r border-slate-200 min-w-[200px] bg-slate-50">
                        <div className="flex items-center gap-2">
                          <LayoutGrid size={16} className="text-slate-400" />
                          <span>工序描述</span>
                        </div>
                      </th>
                      <th className="py-4 px-4 font-bold text-slate-600 border-b border-r border-slate-200 text-center bg-slate-50">
                        <div className="flex items-center justify-center gap-2">
                          <Clock size={16} className="text-slate-400" />
                          <span>工序周期（天）</span>
                        </div>
                      </th>
                      <th className="py-4 px-4 w-24 border-b border-slate-200 bg-slate-50 text-center"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProcessCycles.map((item, idx) => {
                      const rowModified = isRowModified(item);
                      // Find the actual index in the original array for updates
                      const originalIdx = processCycles.findIndex(pc => pc.id === item.id);
                      return (
                        <tr key={item.id} className={cn(
                          "group transition-all duration-200",
                          rowModified ? "bg-amber-50/30 hover:bg-amber-50/50" : "hover:bg-amber-50/20"
                        )}>
                          <td className={cn(
                            "py-3 px-4 border-r border-slate-100 transition-colors",
                            isFieldModified(item, 'opCode') ? "bg-amber-50/50" : ""
                          )}>
                            <div className="flex items-center gap-2">
                              {isFieldModified(item, 'opCode') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                              <input 
                                type="text" 
                                value={item.opCode}
                                onChange={(e) => {
                                  const newCycles = [...processCycles];
                                  newCycles[originalIdx].opCode = e.target.value;
                                  setProcessCycles(newCycles);
                                }}
                                placeholder="工序"
                                className={cn(
                                  "bg-transparent border-none focus:ring-2 focus:ring-amber-500/20 rounded px-2 py-1 w-full font-mono transition-all outline-none placeholder:text-slate-400",
                                  isFieldModified(item, 'opCode') ? "text-amber-600 font-bold" : "text-slate-700"
                                )}
                                title={item.original ? `原始值: ${item.original.opCode}` : undefined}
                              />
                            </div>
                          </td>
                          <td className={cn(
                            "py-3 px-4 border-r border-slate-100 transition-colors",
                            isFieldModified(item, 'opName') ? "bg-amber-50/50" : ""
                          )}>
                            <div className="flex items-center gap-2">
                              {isFieldModified(item, 'opName') && <AlertCircle size={12} className="text-amber-500 shrink-0" />}
                              <input 
                                type="text" 
                                value={item.opName}
                                onChange={(e) => {
                                  const newCycles = [...processCycles];
                                  newCycles[originalIdx].opName = e.target.value;
                                  setProcessCycles(newCycles);
                                }}
                                placeholder="工序描述"
                                className={cn(
                                  "bg-transparent border-none focus:ring-2 focus:ring-amber-500/20 rounded px-2 py-1 w-full transition-all outline-none placeholder:text-slate-400",
                                  isFieldModified(item, 'opName') ? "text-amber-600 font-bold" : "text-slate-700"
                                )}
                                title={item.original ? `原始值: ${item.original.opName}` : undefined}
                              />
                            </div>
                          </td>
                          <td className={cn(
                            "py-3 px-4 border-r border-slate-100 transition-colors",
                            isFieldModified(item, 'cycleDays') ? "bg-amber-50/50" : ""
                          )}>
                            <input 
                              type="number" 
                              step="1"
                              value={item.cycleDays}
                              onChange={(e) => {
                                const newCycles = [...processCycles];
                                newCycles[originalIdx].cycleDays = Math.round(parseFloat(e.target.value)) || 0;
                                setProcessCycles(newCycles);
                              }}
                              placeholder="周期"
                              className={cn(
                                "w-full bg-transparent border-none text-center focus:ring-2 focus:ring-amber-500/20 rounded py-1 font-mono transition-all outline-none",
                                isFieldModified(item, 'cycleDays') ? "text-amber-600 font-bold" : "text-slate-600"
                              )}
                              title={item.original ? `原始值: ${item.original.cycleDays}` : undefined}
                            />
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {rowModified && (
                                <button 
                                  onClick={() => restoreRow(originalIdx, 'process')}
                                  className="p-1.5 text-amber-500 hover:bg-amber-100 rounded-lg transition-all"
                                  title="恢复原始数据"
                                >
                                  <RotateCcw size={14} />
                                </button>
                              )}
                              <button 
                                onClick={() => setProcessCycles(processCycles.filter(t => t.id !== item.id))}
                                className="p-1.5 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-lg transition-all opacity-0 group-hover:opacity-100"
                                title="删除工序"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      case 'calendar':
        return <ProductionCalendar settings={settings} onSettingsChange={setSettings} />;
      case 'exceptions':
        return <ExceptionMonitoring analysisResult={analysisResult} />;
      case 'settings':
        return (
          <div className="max-w-5xl mx-auto space-y-8">
            <div className="flex items-center justify-between mb-6">
              <div>
                <h2 className="text-3xl font-bold text-slate-900 tracking-tight">系统设置</h2>
              </div>
              <button
                onClick={() => {
                  addNotification('success', '系统配置已成功保存并应用');
                  setActiveTab('analysis');
                }}
                className="flex items-center gap-2 bg-slate-900 text-white px-6 py-2.5 rounded-xl font-bold shadow-md shadow-slate-900/20 hover:bg-slate-800 transition-all active:scale-95 group text-sm"
              >
                <Save size={16} className="group-hover:scale-110 transition-transform" />
                保存所有配置
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 items-start gap-6">
              {/* 班组排序设置 */}
              <div className="glass-card p-6 lg:col-span-2">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-sm">
                    <ListOrdered size={20} />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-900">班组展示优先级</h3>
                    <p className="text-xs text-slate-500">自定义班组在图表和表格中的显示顺序</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <DraggableTeamList 
                      teams={settings.teamOrder || DEFAULT_TEAM_ORDER}
                      onChange={(newOrder) => setSettings({ ...settings, teamOrder: newOrder, teamOrderVersion: DEFAULT_TEAM_ORDER_VERSION })}
                    />
                    <p className="text-[11px] text-slate-400 mt-2 flex items-center gap-1">
                      <AlertCircle size={12} />
                      提示：系统会根据上述关键词匹配班组名称，未匹配到的班组将按拼音顺序排在最后。
                    </p>
                  </div>
                  <div className="flex justify-end">
                    <button 
                      onClick={() => setSettings({ ...settings, teamOrder: DEFAULT_TEAM_ORDER, teamOrderVersion: DEFAULT_TEAM_ORDER_VERSION })}
                      className="text-xs text-indigo-600 hover:text-indigo-700 font-medium transition-colors flex items-center gap-1"
                    >
                      <RotateCcw size={12} />
                      恢复默认排序
                    </button>
                  </div>
                </div>
              </div>

              {/* 右侧配置列 */}
              <div className="lg:col-span-1 space-y-6">
                {/* 参数配置 */}
                <div className="glass-card p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shadow-sm">
                      <Zap size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">参数配置</h3>
                      <p className="text-xs text-slate-500">调整产能分析的核心计算参数</p>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-slate-700">工序周期默认值</label>
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                          {settings.defaultCycleDays} 天
                        </span>
                      </div>
                      <input 
                        type="range" 
                        min="1" 
                        max="14" 
                        step="1"
                        value={settings.defaultCycleDays || 2}
                        onChange={(e) => setSettings({ ...settings, defaultCycleDays: parseInt(e.target.value) })}
                        className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer accent-blue-600"
                      />
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-slate-400">1天</span>
                        <span className="text-[10px] text-slate-400">14天</span>
                      </div>
                      <p className="text-[11px] text-slate-400 mt-3 leading-relaxed">
                        <AlertCircle size={10} className="inline mr-1 mb-0.5" />
                        提示：当系统在“工序周期”数据中匹配不到对应工序时，将自动使用此默认值进行产能分析计算。
                      </p>
                    </div>
                  </div>
                </div>

                {/* 产能负荷计算逻辑 */}
                <div className="glass-card p-6">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shadow-sm">
                      <BarChart3 size={20} />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900">产能负荷计算逻辑</h3>
                      <p className="text-xs text-slate-500">配置月度产能负荷的汇总统计方式</p>
                    </div>
                  </div>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3">
                      <button
                        onClick={() => setSettings({ ...settings, aggregationLogic: 'startDate' })}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left group",
                          settings.aggregationLogic === 'startDate'
                            ? "border-emerald-500 bg-emerald-50/50"
                            : "border-slate-100 hover:border-slate-200 bg-white"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                            settings.aggregationLogic === 'startDate' ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
                          )}>
                            {settings.aggregationLogic === 'startDate' && <Check size={12} className="text-white" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">按开始生产日期汇总</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">根据工序预计开始生产的月份进行产能统计（默认）</p>
                          </div>
                        </div>
                      </button>

                      <button
                        onClick={() => setSettings({ ...settings, aggregationLogic: 'dueDate' })}
                        className={cn(
                          "flex items-center justify-between p-4 rounded-xl border-2 transition-all text-left group",
                          settings.aggregationLogic === 'dueDate'
                            ? "border-emerald-500 bg-emerald-50/50"
                            : "border-slate-100 hover:border-slate-200 bg-white"
                        )}
                      >
                        <div className="flex items-center gap-3">
                          <div className={cn(
                            "w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors",
                            settings.aggregationLogic === 'dueDate' ? "border-emerald-500 bg-emerald-500" : "border-slate-300"
                          )}>
                            {settings.aggregationLogic === 'dueDate' && <Check size={12} className="text-white" />}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-900">按交货日期汇总</p>
                            <p className="text-[11px] text-slate-500 mt-0.5">根据订单交货日期的月份进行产能统计</p>
                          </div>
                        </div>
                      </button>
                    </div>
                    
                    <p className="text-[11px] text-slate-400 leading-relaxed">
                      <AlertCircle size={10} className="inline mr-1 mb-0.5" />
                      提示：此设置将直接影响产能负荷分析计算结果。
                    </p>
                  </div>
                </div>

                {/* 数据与安全已移除 */}
              </div>

            </div>
          </div>
        );
      default:
        return <div className="p-8 text-center text-slate-400">功能开发中...</div>;
    }
  };

  return (
    <div className="h-screen flex flex-col font-sans overflow-hidden">
      {/* Header */}
      <header className="h-16 bg-brand-dark text-white flex items-center justify-between px-6 sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-4">
          <Menu 
            className="text-slate-400 cursor-pointer hover:text-white transition-colors" 
            size={20} 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          />
          <div className="flex items-center gap-3">
            <div className="h-10 flex items-center">
              <img 
                src="/logo.png" 
                alt="Hongshi Logo" 
                className="h-8 w-auto object-contain"
                onError={(e) => {
                  // Fallback to stylized H if image not found
                  e.currentTarget.style.display = 'none';
                  const placeholder = document.createElement('div');
                  placeholder.className = "w-8 h-8 bg-brand-red rounded-lg flex items-center justify-center font-bold text-lg shadow-inner";
                  placeholder.innerText = "H";
                  e.currentTarget.parentElement!.appendChild(placeholder);
                }}
              />
            </div>
            <div className="w-px h-6 bg-white/20 mx-1"></div>
            <div>
              <h1 className="text-lg font-bold leading-none tracking-tight">产能负荷分析</h1>
              <p className="text-[10px] text-slate-400 font-medium uppercase tracking-widest mt-1">Capacity Load Analysis</p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-4 text-slate-400 relative" ref={bellRef}>
            <div 
              className="relative cursor-pointer hover:text-white transition-colors p-1"
              onClick={() => setIsBellOpen(!isBellOpen)}
            >
              <Bell size={18} />
              {systemMessages.filter(m => !m.isRead).length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 bg-red-500 text-white text-[8px] font-bold rounded-full border border-slate-900 flex items-center justify-center">
                  {systemMessages.filter(m => !m.isRead).length > 9 ? '9+' : systemMessages.filter(m => !m.isRead).length}
                </span>
              )}
            </div>

            <AnimatePresence>
              {isBellOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.95 }}
                  className="absolute right-0 top-full mt-2 w-80 bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden z-50"
                >
                  <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                    <h4 className="font-bold text-slate-900 flex items-center gap-2">
                      通知中心
                      {systemMessages.filter(m => !m.isRead).length > 0 && (
                        <span className="bg-red-100 text-red-600 text-[10px] px-1.5 py-0.5 rounded-full">
                          {systemMessages.filter(m => !m.isRead).length}
                        </span>
                      )}
                    </h4>
                    <div className="flex gap-3">
                      <button 
                        onClick={markAllAsRead}
                        className="text-[10px] text-blue-600 hover:underline font-medium"
                      >
                        全部已读
                      </button>
                      <button 
                        onClick={clearMessages}
                        className="text-[10px] text-slate-400 hover:text-red-500 font-medium"
                      >
                        清空
                      </button>
                    </div>
                  </div>
                  <div className="max-h-[400px] overflow-y-auto custom-scrollbar">
                    {systemMessages.length === 0 ? (
                      <div className="p-10 text-center">
                        <Bell size={32} className="mx-auto text-slate-200 mb-2" />
                        <p className="text-sm text-slate-400">暂无通知消息</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-50">
                        {systemMessages.map(msg => (
                          <div 
                            key={msg.id} 
                            className={cn(
                              "p-4 hover:bg-slate-50 transition-colors cursor-default relative",
                              !msg.isRead && "bg-blue-50/30"
                            )}
                          >
                            {!msg.isRead && (
                              <div className="absolute left-0 top-0 bottom-0 w-1 bg-blue-500" />
                            )}
                            <div className="flex gap-3">
                              <div className={cn(
                                "w-8 h-8 rounded-full shrink-0 flex items-center justify-center",
                                msg.type === 'success' ? "bg-emerald-50 text-emerald-600" :
                                msg.type === 'warning' ? "bg-amber-50 text-amber-600" :
                                msg.type === 'error' ? "bg-red-50 text-red-600" :
                                "bg-blue-50 text-blue-600"
                              )}>
                                {msg.type === 'success' ? <CheckCircle2 size={14} /> :
                                 msg.type === 'warning' ? <AlertTriangle size={14} /> :
                                 msg.type === 'error' ? <AlertCircle size={14} /> :
                                 <Info size={14} />}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between mb-0.5">
                                  <p className="text-xs font-bold text-slate-900 truncate">{msg.title}</p>
                                  <span className="text-[10px] text-slate-400 shrink-0">
                                    {msg.time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </span>
                                </div>
                                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2">
                                  {msg.content}
                                </p>
                                {msg.category === 'exception' && (
                                  <button 
                                    onClick={() => {
                                      setActiveTab('exceptions');
                                      setIsBellOpen(false);
                                    }}
                                    className="mt-2 text-[10px] text-blue-600 font-medium hover:underline flex items-center gap-1"
                                  >
                                    立即处理 <ChevronRight size={10} />
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
          <div className="flex items-center gap-3 pl-6 border-l border-slate-700">
            <div className="text-right">
              <p className="text-sm font-semibold">管理员</p>
              <p className="text-[10px] text-slate-500">生产计划部</p>
            </div>
            <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center text-slate-400 border border-slate-700">
              <User size={20} />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className={cn(
          "bg-white border-r border-slate-200 flex flex-col shadow-sm z-40 transition-all duration-300 ease-in-out",
          isSidebarOpen ? "w-64" : "w-20"
        )}>
          <nav className="flex-1 py-6 px-3 space-y-1 overflow-y-auto custom-scrollbar">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as Tab)}
                className={cn(
                  "w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 group",
                  activeTab === item.id 
                    ? "bg-brand-red/5 text-brand-red shadow-sm" 
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                  !isSidebarOpen && "justify-center px-0"
                )}
              >
                <div className={cn("flex items-center gap-3", !isSidebarOpen && "gap-0")}>
                  <item.icon size={20} className={cn(
                    "transition-transform duration-200 shrink-0",
                    activeTab === item.id ? "scale-110" : "group-hover:scale-110"
                  )} />
                  <AnimatePresence>
                    {isSidebarOpen && (
                      <motion.span 
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -10 }}
                        className="text-sm font-medium whitespace-nowrap"
                      >
                        {item.label}
                      </motion.span>
                    )}
                  </AnimatePresence>
                </div>
                {isSidebarOpen && activeTab === item.id && <ChevronRight size={14} className="opacity-50 shrink-0 ml-auto" />}
              </button>
            ))}
          </nav>
          
          <div className="p-3 border-t border-slate-100">
            <button
              onClick={() => setActiveTab('settings')}
              className={cn(
                "w-full flex items-center px-4 py-3 rounded-xl transition-all duration-200 group",
                activeTab === 'settings' 
                  ? "bg-slate-100 text-slate-900" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900",
                !isSidebarOpen && "justify-center px-0"
              )}
            >
              <div className={cn("flex items-center gap-3", !isSidebarOpen && "gap-0")}>
                <Settings size={20} className="shrink-0" />
                <AnimatePresence>
                  {isSidebarOpen && (
                    <motion.span 
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -10 }}
                      className="text-sm font-medium whitespace-nowrap"
                    >
                      系统设置
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            </button>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 overflow-y-auto bg-slate-50/50 p-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {renderContent()}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
      {/* Notifications */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
        <AnimatePresence>
          {notifications.map(n => (
            <motion.div
              key={n.id}
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className={cn(
                "pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl border min-w-[300px]",
                n.type === 'success' ? "bg-emerald-50 border-emerald-100 text-emerald-800" :
                n.type === 'error' ? "bg-red-50 border-red-100 text-red-800" :
                "bg-indigo-50 border-indigo-100 text-indigo-800"
              )}
            >
              {n.type === 'success' ? <Check size={18} className="text-emerald-500" /> :
               n.type === 'error' ? <X size={18} className="text-red-500" /> :
               <Bell size={18} className="text-indigo-500" />}
              <span className="font-medium text-sm">{n.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
