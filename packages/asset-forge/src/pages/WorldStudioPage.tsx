/**
 * World Studio Page — Unified world authoring tool
 *
 * Routes:
 *   /world-studio           → WorldPickerPage (project list)
 *   /world-studio/:projectId → WorldStudioProvider + WorldStudioLayout (editor)
 */

import React from "react";
import { useParams } from "react-router-dom";

import { WorldPickerPage } from "../components/WorldStudio/WorldPickerPage";
import { WorldStudioProvider } from "../components/WorldStudio/WorldStudioContext";
import { WorldStudioLayout } from "../components/WorldStudio/WorldStudioLayout";

export const WorldStudioPage: React.FC = () => {
  const { projectId } = useParams<{ projectId: string }>();

  if (!projectId) {
    return <WorldPickerPage />;
  }

  return (
    <WorldStudioProvider>
      <WorldStudioLayout projectId={projectId} />
    </WorldStudioProvider>
  );
};
