import { ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TeamCategory } from './types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatNumber(num: number, decimals: number = 1) {
  return num.toLocaleString('zh-CN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

export const DEFAULT_TEAM_ORDER_VERSION = '20260320';

export const DEFAULT_TEAM_ORDER = [
  '下料',
  '下料（引擎）',
  '剪床',
  '锯割',
  '冲压',
  '车加',
  '车铣复合',
  '立铣',
  '卧铣',
  '卧铣6300',
  '四轴',
  '五轴',
  '研磨',
  '机加（打磨）',
  '去毛刺',
  '去毛刺（引擎）',
  '自动去毛刺机',
  '钳工',
  '钳工（引擎）',
  '折弯',
  '折弯（引擎）',
  '专项钣金',
  '喷砂',
  '拉丝',
  '丝印',
  '阳极',
  '阳极保护',
  '钝化',
  '铬化',
  '喷涂保护',
  '喷漆',
  '喷粉',
  '热处理-固溶炉',
  '热处理-时效炉',
  '热处理-真空炉',
  '热处理校形',
  '橡皮囊成型',
  '熔焊(AL）',
  '熔焊（SUS)',
  '电阻焊（AL）',
  '电阻焊（SUS)',
  '植焊',
  '直缝焊',
  '焊接打磨',
  '打码',
  '内饰装配',
  '航电装配',
  '引擎装配',
  '品质',
  '体系',
  '外协',
  '其他'
];

export function sortTeams(teams: string[], customOrder?: string[], categories?: TeamCategory[]) {
  const validCustomOrder = customOrder?.filter(t => t && String(t).trim().length > 0);
  const orderList = validCustomOrder && validCustomOrder.length > 0 ? validCustomOrder : DEFAULT_TEAM_ORDER;
  
  return [...teams].sort((a, b) => {
    const strA = String(a || '');
    const strB = String(b || '');
    
    // 1. Check Categories first (User defined)
    if (categories && categories.length > 0) {
      const catA = categories.find(c => c.teamNames.includes(strA));
      const catB = categories.find(c => c.teamNames.includes(strB));

      if (catA && catB) {
        if (catA.id !== catB.id) {
          return catA.order - catB.order;
        }
        // Same category, sort by index in teamNames
        return catA.teamNames.indexOf(strA) - catA.teamNames.indexOf(strB);
      }
      
      if (catA) return -1;
      if (catB) return 1;
    }

    // 2. Fallback to Scheme 1 rules (Default Order / Keyword matching)
    // 优先完全匹配
    let idxA = orderList.findIndex(t => strA === t);
    let idxB = orderList.findIndex(t => strB === t);
    
    // 如果没有完全匹配，再尝试包含匹配
    if (idxA === -1) {
      idxA = orderList.findIndex(t => strA.includes(t));
    }
    if (idxB === -1) {
      idxB = orderList.findIndex(t => strB.includes(t));
    }
    
    if (idxA !== -1 && idxB !== -1) {
      if (idxA !== idxB) {
        return idxA - idxB;
      }
      return strA.localeCompare(strB, 'zh-CN');
    }
    if (idxA !== -1) return -1;
    if (idxB !== -1) return 1;
    
    return strA.localeCompare(strB, 'zh-CN');
  });
}
