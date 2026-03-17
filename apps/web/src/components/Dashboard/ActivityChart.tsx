import React from 'react';

interface ActivityChartProps {
  title: string;
  data: Array<{ time: string; value: number }>;
  color?: string;
}

export const ActivityChart: React.FC<ActivityChartProps> = ({ 
  title, 
  data, 
  color = '#0066CC' 
}) => {
  const maxValue = Math.max(...data.map(d => d.value));
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      
      <div className="relative h-64">
        <div className="absolute inset-0 flex items-end justify-between space-x-1">
          {data.map((point, index) => (
            <div key={index} className="flex-1 flex flex-col items-center group">
              <div
                className="w-full bg-gradient-to-t from-blue-500 to-blue-300 rounded-t-sm transition-all duration-300 hover:opacity-80 cursor-pointer"
                style={{
                  height: `${(point.value / maxValue) * 100}%`,
                  backgroundColor: color,
                  minHeight: '4px'
                }}
                title={`${point.time}: ${point.value}`}
              />
              <span className="text-xs text-gray-500 mt-2 transform rotate-45 origin-left">
                {point.time}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};