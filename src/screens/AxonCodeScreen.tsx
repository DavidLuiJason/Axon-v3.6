import React from 'react';
import { WorkspacePane } from '../components/WorkspacePane';

export interface AxonCodeScreenProps {
  initialTab?: 'code' | 'preview';
}

export const AxonCodeScreen: React.FC<AxonCodeScreenProps> = ({ initialTab }) => {
  return <WorkspacePane initialTab={initialTab} />;
};

