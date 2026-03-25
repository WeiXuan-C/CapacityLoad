export interface Notification {
  id: number;
  type: 'success' | 'error' | 'info';
  message: string;
}

export interface ProductionDemand {
  id: string;
  orderNo: string;
  workOrderOpNo?: string;
  componentCode: string;
  componentDesc: string;
  opNo: string;
  opCode: string;
  opDesc: string;
  resourceGroupId: string;
  resourceGroupDesc?: string;
  dueDate: string;
  requiredQty: number;
  completedQty: number;
  rejectedQty: number;
  actualHours: number;
  isCompleted?: boolean;
  rawRow?: any;
  original?: {
    orderNo: string;
    workOrderOpNo?: string;
    componentCode: string;
    componentDesc: string;
    opNo: string;
    opCode: string;
    opDesc: string;
    resourceGroupId: string;
    resourceGroupDesc?: string;
    dueDate: string;
    requiredQty: number;
    completedQty: number;
    rejectedQty: number;
    actualHours: number;
    isCompleted?: boolean;
  };
}

export interface ProductionResource {
  id: string;
  name?: string;
  type?: 'people' | 'machine';
  groupName: string;
  capacity?: number;
  team?: string;
  workshop?: string;
  original?: {
    id?: string;
    name?: string;
    type?: 'people' | 'machine';
    groupName?: string;
    capacity?: number;
    team?: string;
    workshop?: string;
  };
}

export interface StandardTime {
  id: string;
  groupName: string;
  peopleCount: number;
  peopleShifts: number;
  peopleDuration: number;
  peopleOee: number;
  machineCount: number;
  machineShifts: number;
  machineDuration: number;
  machineOee: number;
  original?: {
    groupName: string;
    peopleCount: number;
    peopleShifts: number;
    peopleDuration: number;
    peopleOee: number;
    machineCount: number;
    machineShifts: number;
    machineDuration: number;
    machineOee: number;
  };
}

export interface ProcessCycle {
  id: string;
  opCode?: string;
  opName?: string;
  cycleDays?: number;
  processName?: string;
  peopleCount?: number;
  peopleSetupTime?: number;
  peopleRunTime?: number;
  peopleCycleTime?: number;
  machineCount?: number;
  machineSetupTime?: number;
  machineRunTime?: number;
  machineCycleTime?: number;
  original?: {
    opCode?: string;
    opName?: string;
    cycleDays?: number;
    processName?: string;
    peopleCount?: number;
    peopleSetupTime?: number;
    peopleRunTime?: number;
    peopleCycleTime?: number;
    machineCount?: number;
    machineSetupTime?: number;
    machineRunTime?: number;
    machineCycleTime?: number;
  };
}

export interface AnalysisResult {
  totalLoad: number;
  totalCapacity: number;
  utilizationRate: number;
  dailyData: {
    date: string;
    team: string;
    load: number;
    overdueLoad: number;
    plannedLoad: number;
    humanCapacity: number;
    machineCapacity: number;
  }[];
  monthlyTeamData: MonthlyTeamAnalysis[];
  totalWorkingDays: number;
  scheduledDemands: (ProductionDemand & { 
    demandHours: number; 
    startDate: Date; 
    isOverdue: boolean;
    team: string;
    monthStr: string;
    uncompletedQty: number;
    cycleDays: number;
  })[];
  exceptions: {
    unmatchedResourceGroups: { id: string; description: string }[];
    unmatchedOperations: { opCode: string; opDesc: string }[];
  };
}

export interface MonthlyTeamAnalysis {
  month: string;
  team: string;
  workingDays: number;
  human: {
    load: number;
    overdueLoad: number;
    plannedLoad: number;
    capacity: number;
    utilization: number;
  };
  machine: {
    load: number;
    overdueLoad: number;
    plannedLoad: number;
    capacity: number;
    utilization: number;
  };
}

export interface TeamCategory {
  id: string;
  name: string;
  order: number;
  teamNames: string[];
}

export interface SystemSettings {
  schedulingStrategy: 'EDD' | 'SPT' | 'FCFS';
  alertThreshold: number;
  displayDensity: 'compact' | 'comfortable';
  calendarOverrides?: { [date: string]: boolean };
  teamOrder?: string[];
  teamOrderVersion?: string;
  teamCategories?: TeamCategory[];
  customHolidays?: string[];
  defaultCycleDays?: number;
  aggregationLogic?: 'startDate' | 'dueDate';
}

export type Demand = ProductionDemand;
export type Resource = ProductionResource;
