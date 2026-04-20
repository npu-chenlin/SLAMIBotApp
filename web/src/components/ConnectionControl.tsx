import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {  faLink ,faLinkSlash} from '@fortawesome/free-solid-svg-icons';

interface ConnectionControlProps {
  isConnected: boolean;
  onToggleConnection: () => void;
}

const ConnectionControl: React.FC<ConnectionControlProps> = ({
  isConnected,
  onToggleConnection
}) => {
  return (
    <div className="connection-control">
      <button
        onClick={onToggleConnection}
        className={`connection-button ${isConnected ? 'connected' : 'disconnected'}`}
        // title={isConnected ? 'Disconnect' : 'Connect'}
      >
        <FontAwesomeIcon
          icon={isConnected ? faLink : faLinkSlash}
          style={{ fontSize: '20px' }}
        />
        {/* <span className="connection-status">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span> */}
      </button>
    </div>
  );
};

export default ConnectionControl; 