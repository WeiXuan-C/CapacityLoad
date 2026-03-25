import { useMemo } from 'react';
import { ProductionDemand, ProductionResource, StandardTime, AnalysisResult, SystemSettings, MonthlyTeamAnalysis, ProcessCycle } from '../types';
import { sortTeams } from '../utils';

export function useCapacityAnalysis(
  demands: ProductionDemand[],
  resources: ProductionResource[],
  standardTimes: StandardTime[],
  settings: SystemSettings,
  processCycles: ProcessCycle[]
) {
  const analysisResult = useMemo<AnalysisResult>(() => {
    const isWorkingDay = (date: Date) => {
      const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      if (settings.calendarOverrides?.[dateKey] !== undefined) {
        return settings.calendarOverrides[dateKey];
      }
      const dayOfWeek = date.getDay();
      const isSunday = dayOfWeek === 0;
      return !isSunday;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayTime = today.getTime();

    // 1. Data Cleaning & Initialization
    let filteredDemands = demands.filter(d => !d.isCompleted);
    const orderGroups = new Map<string, typeof demands>();
    filteredDemands.forEach(d => {
      if (!orderGroups.has(d.orderNo)) orderGroups.set(d.orderNo, []);
      orderGroups.get(d.orderNo)!.push(d);
    });
    const validOrders = new Set<string>();
    orderGroups.forEach((group, orderNo) => {
      const hasEmptyDueDate = group.some(d => !d.dueDate);
      if (!hasEmptyDueDate) validOrders.add(orderNo);
    });
    filteredDemands = filteredDemands.filter(d => validOrders.has(d.orderNo));
    const seenOrderOp = new Set<string>();
    filteredDemands = filteredDemands.filter(d => {
      const key = d.workOrderOpNo ? d.workOrderOpNo.trim() : `${d.orderNo}_${d.opNo}`;
      if (seenOrderOp.has(key)) return false;
      seenOrderOp.add(key);
      return true;
    });

    const processCycleMap = new Map<string, ProcessCycle>();
    processCycles.forEach(pc => {
      if (pc.opCode) processCycleMap.set(pc.opCode.trim().toUpperCase(), pc);
    });

    const unmatchedResourceGroups = new Map<string, string>();
    const unmatchedOperations = new Map<string, string>();

    const cleanedDemands = filteredDemands.map(d => {
      const uncompletedQty = d.requiredQty - d.completedQty - (d.rejectedQty || 0);
      const actualHours = d.actualHours || 0;
      const demandHours = Number(((uncompletedQty * actualHours) / 60).toFixed(2));
      const opCodeUpper = d.opCode.trim().toUpperCase();
      const pc = processCycleMap.get(opCodeUpper);
      
      if (!pc && d.opCode) {
        unmatchedOperations.set(opCodeUpper, d.opDesc || '');
      }
      
      const cycleDays = pc?.cycleDays || settings.defaultCycleDays || 2;
      return { ...d, uncompletedQty, demandHours, cycleDays };
    }).filter(d => d.uncompletedQty > 0);

    // 2. Reverse Scheduling
    const scheduledDemands: any[] = [];
    const groupedByOrder = new Map<string, typeof cleanedDemands>();
    cleanedDemands.forEach(d => {
      if (!groupedByOrder.has(d.orderNo)) groupedByOrder.set(d.orderNo, []);
      groupedByOrder.get(d.orderNo)!.push(d);
    });

    groupedByOrder.forEach((group) => {
      const sortedGroup = [...group].sort((a, b) => parseInt(b.opNo) - parseInt(a.opNo));
      let nextStartDate: Date | null = null;
      for (let i = 0; i < sortedGroup.length; i++) {
        const currentOp = sortedGroup[i] as any;
        if (currentOp.opCode.toUpperCase().startsWith('WX')) {
          const wxGroup = [currentOp];
          let j = i + 1;
          while (j < sortedGroup.length && (sortedGroup[j] as any).opCode.toUpperCase().startsWith('WX')) {
            wxGroup.push(sortedGroup[j] as any);
            j++;
          }
          const maxCycle = Math.max(...wxGroup.map(wx => wx.cycleDays));
          const baseDate = nextStartDate || new Date(currentOp.dueDate);
          const groupStartDate = new Date(baseDate);
          groupStartDate.setDate(baseDate.getDate() - maxCycle);
          wxGroup.forEach(wx => {
            wx.startDate = new Date(groupStartDate);
            scheduledDemands.push(wx);
          });
          nextStartDate = groupStartDate;
          i = j - 1;
        } else {
          const baseDate = nextStartDate || new Date(currentOp.dueDate);
          const startDate = new Date(baseDate);
          startDate.setDate(baseDate.getDate() - currentOp.cycleDays);
          currentOp.startDate = startDate;
          scheduledDemands.push(currentOp);
          nextStartDate = startDate;
        }
      }
    });

    const resourceMap = new Map<string, ProductionResource>();
    resources.forEach(r => resourceMap.set(r.id, r));

    const finalDemands = scheduledDemands.map(d => {
      const resource = resourceMap.get(d.resourceGroupId);
      const team = resource ? (resource.team || '其他').trim() : '其他';
      
      if ((!resource || !resource.team) && d.resourceGroupId) {
        unmatchedResourceGroups.set(d.resourceGroupId, d.resourceGroupDesc || resource?.groupName || '');
      }
      
      // Determine if overdue based on the current aggregation logic
      const dueDate = new Date(d.dueDate);
      dueDate.setHours(0, 0, 0, 0);
      const isOverdue = settings.aggregationLogic === 'dueDate'
        ? dueDate.getTime() < todayTime
        : d.startDate.getTime() < todayTime;
      
      // Determine which date to use for aggregation based on settings
      const baseDate = settings.aggregationLogic === 'dueDate' ? dueDate : d.startDate;
      const aggregationDate = isOverdue ? today : baseDate;
      const monthStr = `${aggregationDate.getFullYear()}年${(aggregationDate.getMonth() + 1).toString().padStart(2, '0')}月`;
      
      return { ...d, team, isOverdue, monthStr };
    });

    const dailyLoadMap = new Map<string, { overdue: number, planned: number }>();
    const monthlyTeamMap = new Map<string, MonthlyTeamAnalysis>();

    finalDemands.forEach(d => {
      // Skip capacity load calculation for "WX" (Outsourced) operations
      if (d.opCode.toUpperCase().startsWith('WX')) return;

      // For daily load, we still use the production start date (or today if overdue) 
      // as it represents when the work is actually being performed.
      const dailyAggregationDate = d.isOverdue ? today : d.startDate;
      const dateKey = `${dailyAggregationDate.getFullYear()}-${String(dailyAggregationDate.getMonth() + 1).padStart(2, '0')}-${String(dailyAggregationDate.getDate()).padStart(2, '0')}`;
      const dailyKey = `${dateKey}_${d.team}`;
      const currentDaily = dailyLoadMap.get(dailyKey) || { overdue: 0, planned: 0 };
      if (d.isOverdue) currentDaily.overdue += d.demandHours;
      else currentDaily.planned += d.demandHours;
      dailyLoadMap.set(dailyKey, currentDaily);

      const monthlyKey = `${d.monthStr}_${d.team}`;
      if (!monthlyTeamMap.has(monthlyKey)) {
        monthlyTeamMap.set(monthlyKey, {
          month: d.monthStr,
          team: d.team,
          workingDays: 0,
          human: { load: 0, overdueLoad: 0, plannedLoad: 0, capacity: 0, utilization: 0 },
          machine: { load: 0, overdueLoad: 0, plannedLoad: 0, capacity: 0, utilization: 0 }
        });
      }
      const entry = monthlyTeamMap.get(monthlyKey)!;
      entry.human.load += d.demandHours;
      entry.machine.load += d.demandHours;
      if (d.isOverdue) {
        entry.human.overdueLoad += d.demandHours;
        entry.machine.overdueLoad += d.demandHours;
      } else {
        entry.human.plannedLoad += d.demandHours;
        entry.machine.plannedLoad += d.demandHours;
      }
    });

    const teams = sortTeams(
      Array.from(new Set(resources.map(r => (r?.team || '其他').trim()))),
      settings.teamOrder,
      settings.teamCategories
    );
    if (teams.length === 0) teams.push('其他');

    const dailyData: any[] = [];
    const startDateForDaily = new Date(today);
    for (let i = 0; i < 30; i++) {
      const currentDate = new Date(startDateForDaily);
      currentDate.setDate(startDateForDaily.getDate() + i);
      const dateStr = `${(currentDate.getMonth() + 1).toString().padStart(2, '0')}-${currentDate.getDate().toString().padStart(2, '0')}`;
      const fullDateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
      const isWorking = isWorkingDay(currentDate);
      teams.forEach(team => {
        let dailyTeamHumanCapacity = 0;
        let dailyTeamMachineCapacity = 0;
        const teamStdTimes = standardTimes.filter(s => (s.groupName || '').trim() === team);
        teamStdTimes.forEach(group => {
          if (isWorking) {
            dailyTeamHumanCapacity += group.peopleCount * group.peopleShifts * group.peopleDuration * group.peopleOee;
            dailyTeamMachineCapacity += group.machineCount * group.machineShifts * group.machineDuration * group.machineOee;
          }
        });
        const dailyKey = `${fullDateStr}_${team}`;
        const loadInfo = dailyLoadMap.get(dailyKey) || { overdue: 0, planned: 0 };
        dailyData.push({
          date: dateStr,
          team: team,
          load: loadInfo.overdue + loadInfo.planned,
          overdueLoad: loadInfo.overdue,
          plannedLoad: loadInfo.planned,
          humanCapacity: dailyTeamHumanCapacity,
          machineCapacity: dailyTeamMachineCapacity
        });
      });
    }

    const uniqueMonthsForTotal = new Set<string>();
    let totalWorkingDays = 0;
    
    // Get all unique months from actual demands
    const allMonths = new Set<string>();
    finalDemands.forEach(d => allMonths.add(d.monthStr));

    // Pre-populate monthlyTeamMap with all teams and months to ensure capacity is calculated
    allMonths.forEach(month => {
      teams.forEach(team => {
        const key = `${month}_${team}`;
        if (!monthlyTeamMap.has(key)) {
          monthlyTeamMap.set(key, {
            month: month,
            team: team,
            workingDays: 0,
            human: { load: 0, overdueLoad: 0, plannedLoad: 0, capacity: 0, utilization: 0 },
            machine: { load: 0, overdueLoad: 0, plannedLoad: 0, capacity: 0, utilization: 0 }
          });
        }
      });
    });

    monthlyTeamMap.forEach((entry) => {
      const match = entry.month.match(/(\d+)年(\d+)月/);
      if (!match) return;
      const year = parseInt(match[1]);
      const month = parseInt(match[2]);
      let workingDays = 0;
      const daysInMonth = new Date(year, month, 0).getDate();
      
      const currentYear = today.getFullYear();
      const currentMonth = today.getMonth() + 1;
      
      let startDay = 1;
      if (year === currentYear && month === currentMonth) {
        startDay = today.getDate();
      } else if (year < currentYear || (year === currentYear && month < currentMonth)) {
        startDay = daysInMonth + 1; // Past month, 0 working days
      }

      for (let d = startDay; d <= daysInMonth; d++) {
        const date = new Date(year, month - 1, d);
        if (isWorkingDay(date)) workingDays++;
      }
      entry.workingDays = workingDays;
      
      if (!uniqueMonthsForTotal.has(entry.month)) {
        totalWorkingDays += workingDays;
        uniqueMonthsForTotal.add(entry.month);
      }

      // Fix: Correctly filter standardTimes for the team
      const teamStdTimes = standardTimes.filter(s => (s.groupName || '').trim() === entry.team);
      
      teamStdTimes.forEach(std => {
        entry.human.capacity += (std.peopleCount * std.peopleShifts * std.peopleDuration * std.peopleOee) * workingDays;
        entry.machine.capacity += (std.machineCount * std.machineShifts * std.machineDuration * std.machineOee) * workingDays;
      });
      entry.human.utilization = entry.human.capacity > 0 ? (entry.human.load / entry.human.capacity) * 100 : 0;
      entry.machine.utilization = entry.machine.capacity > 0 ? (entry.machine.load / entry.machine.capacity) * 100 : 0;
    });

    const totalLoad = dailyData.reduce((acc, d) => acc + d.load, 0);
    const totalCapacity = dailyData.reduce((acc, d) => acc + d.humanCapacity + d.machineCapacity, 0);
    const utilizationRate = totalCapacity > 0 ? (totalLoad / totalCapacity) * 100 : 0;

    return {
      totalLoad: Math.ceil(totalLoad),
      totalCapacity: Math.floor(totalCapacity),
      utilizationRate: utilizationRate,
      dailyData: dailyData,
      monthlyTeamData: Array.from(monthlyTeamMap.values()).sort((a, b) => {
        const monthCompare = a.month.localeCompare(b.month);
        if (monthCompare !== 0) return monthCompare;
        const sortedTeams = sortTeams([a.team, b.team], settings.teamOrder, settings.teamCategories);
        return sortedTeams[0] === a.team ? -1 : 1;
      }),
      totalWorkingDays: totalWorkingDays,
      scheduledDemands: finalDemands,
      exceptions: {
        unmatchedResourceGroups: Array.from(unmatchedResourceGroups.entries()).map(([id, description]) => ({ id, description })),
        unmatchedOperations: Array.from(unmatchedOperations.entries()).map(([opCode, opDesc]) => ({ opCode, opDesc }))
      }
    };
  }, [demands, resources, standardTimes, settings, processCycles]);

  return analysisResult;
}
