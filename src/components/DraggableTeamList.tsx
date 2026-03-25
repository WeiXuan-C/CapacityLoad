import React, { useState, useRef } from 'react';
import { GripVertical, ArrowUp, ArrowDown, Plus, X } from 'lucide-react';
import { cn } from '../utils';

interface DraggableTeamListProps {
  teams: string[];
  onChange: (newTeams: string[]) => void;
}

export function DraggableTeamList({ teams, onChange }: DraggableTeamListProps) {
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [newTeam, setNewTeam] = useState('');

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIdx(index);
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox
    e.dataTransfer.setData('text/html', e.currentTarget.parentNode as any);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIdx === null || draggedIdx === index) return;

    const newTeams = [...teams];
    const draggedItem = newTeams[draggedIdx];
    newTeams.splice(draggedIdx, 1);
    newTeams.splice(index, 0, draggedItem);
    
    onChange(newTeams);
    setDraggedIdx(index);
  };

  const handleDragEnd = () => {
    setDraggedIdx(null);
  };

  const moveUp = (index: number) => {
    if (index === 0) return;
    const newTeams = [...teams];
    const temp = newTeams[index - 1];
    newTeams[index - 1] = newTeams[index];
    newTeams[index] = temp;
    onChange(newTeams);
  };

  const moveDown = (index: number) => {
    if (index === teams.length - 1) return;
    const newTeams = [...teams];
    const temp = newTeams[index + 1];
    newTeams[index + 1] = newTeams[index];
    newTeams[index] = temp;
    onChange(newTeams);
  };

  const removeTeam = (index: number) => {
    const newTeams = [...teams];
    newTeams.splice(index, 1);
    onChange(newTeams);
  };

  const addTeam = () => {
    if (!newTeam.trim() || teams.includes(newTeam.trim())) return;
    onChange([newTeam.trim(), ...teams]);
    setNewTeam('');
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-2">
        <input
          type="text"
          value={newTeam}
          onChange={(e) => setNewTeam(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addTeam()}
          placeholder="输入新班组名称并按回车添加..."
          className="flex-1 text-sm px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
        />
        <button
          onClick={addTeam}
          disabled={!newTeam.trim()}
          className="px-3 py-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-1 text-sm font-medium"
        >
          <Plus size={16} />
          添加
        </button>
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/50 max-h-[400px] overflow-y-auto custom-scrollbar">
        {teams.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-sm">
            暂无班组，请添加或恢复默认排序
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {teams.map((team, index) => (
              <li
                key={`${team}-${index}`}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDragEnd={handleDragEnd}
                className={cn(
                  "flex items-center gap-3 p-3 bg-white transition-all group",
                  draggedIdx === index ? "opacity-50 bg-indigo-50/50" : "hover:bg-slate-50"
                )}
              >
                <div className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-indigo-500 p-1">
                  <GripVertical size={16} />
                </div>
                
                <div className="flex-1 flex items-center gap-3">
                  <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-[10px] font-mono">
                    {index + 1}
                  </span>
                  <span className="text-sm font-medium text-slate-700">{team}</span>
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button
                    onClick={() => moveUp(index)}
                    disabled={index === 0}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    title="上移"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => moveDown(index)}
                    disabled={index === teams.length - 1}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-md disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-slate-400"
                    title="下移"
                  >
                    <ArrowDown size={14} />
                  </button>
                  <div className="w-px h-4 bg-slate-200 mx-1" />
                  <button
                    onClick={() => removeTeam(index)}
                    className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                    title="移除"
                  >
                    <X size={14} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
