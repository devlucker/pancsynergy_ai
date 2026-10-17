import { useState } from 'react';
import type { Page } from '@/types';
import { useBackend } from '@/hooks/useBackend';
import { Sidebar, TopBar } from '@/components/Layout';
import Overview from '@/pages/Overview';
import PredictionLab from '@/pages/PredictionLab';
import ReactionPropertiesLab from '@/pages/ReactionPropertiesLab';
import CancerImpactDynamics from '@/pages/CancerImpactDynamics';
import ModelPerformance from '@/pages/ModelPerformance';
import DatasetExplorer from '@/pages/DatasetExplorer';
import BatchScreening from '@/pages/BatchScreening';
import Methodology from '@/pages/Methodology';

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('overview');
  const backend = useBackend();

  function renderPage() {
    switch (currentPage) {
      case 'overview':
        return <Overview backend={backend} onNavigate={setCurrentPage} />;
      case 'prediction-lab':
        return <PredictionLab backend={backend} onNavigate={setCurrentPage} />;
      case 'reaction-properties':
        return <ReactionPropertiesLab onNavigate={setCurrentPage} />;
      case 'cancer-impact':
        return <CancerImpactDynamics onNavigate={setCurrentPage} />;
      case 'model-performance':
        return <ModelPerformance backend={backend} />;
      case 'dataset-explorer':
        return <DatasetExplorer />;
      case 'batch-screening':
        return <BatchScreening />;
      case 'methodology':
        return <Methodology />;
      default:
        return <Overview backend={backend} onNavigate={setCurrentPage} />;
    }
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F8FAFC]">
      <Sidebar
        currentPage={currentPage}
        onNavigate={setCurrentPage}
        apiStatus={backend.apiStatus}
      />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        <TopBar currentPage={currentPage} backend={backend} />
        <main className="flex-1 overflow-y-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
}
