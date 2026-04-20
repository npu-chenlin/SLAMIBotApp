import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faBatteryFull,
  faBatteryThreeQuarters,
  faBatteryHalf,
  faBatteryQuarter,
  faBatteryEmpty
} from '@fortawesome/free-solid-svg-icons';

interface BatteryIndicatorProps {
  percentage: number;
}

const BatteryIndicator: React.FC<BatteryIndicatorProps> = ({ percentage }) => {
  const getBatteryIcon = (level: number) => {
    if (level > 87.5) return faBatteryFull;
    if (level > 62.5) return faBatteryThreeQuarters;
    if (level > 37.5) return faBatteryHalf;
    if (level > 12.5) return faBatteryQuarter;
    return faBatteryEmpty;
  };

  const getColor = (level: number) => {
    if (level > 20) return '#4CAF50';
    if (level > 10) return '#FFA000';
    return '#F44336';
  };

  return (
    <div className="battery-indicator">
      <FontAwesomeIcon
        icon={getBatteryIcon(percentage)}
        style={{
          color: getColor(percentage),
          fontSize: '24px',
          marginRight: '8px'
        }}
      />
      <span style={{ color: getColor(percentage) }}>
        {Math.round(percentage)}%
      </span>
    </div>
  );
};

export default BatteryIndicator; 