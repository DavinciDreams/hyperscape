import React, { useEffect, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { GAME_API_URL } from "@/lib/api-config";

export const MaintenanceBanner: React.FC = () => {
  const [isMaintenance, setIsMaintenance] = useState(false);

  useEffect(() => {
    let mounted = true;
    const checkHealth = async () => {
      try {
        const res = await fetch(`${GAME_API_URL}/health`);
        if (res.ok) {
          const data = await res.json();
          if (mounted && data.maintenanceMode !== undefined) {
            setIsMaintenance(data.maintenanceMode);
          }
        }
      } catch (err) {
        // Ignore network errors passively
      }
    };

    checkHealth();
    const interval = setInterval(checkHealth, 5000); // Check every 5s

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (!isMaintenance) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        backgroundColor: "#ff4d4d",
        color: "white",
        textAlign: "center",
        padding: "8px 16px",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        fontFamily: "sans-serif",
        fontWeight: "bold",
        fontSize: "14px",
        boxShadow: "0 2px 10px rgba(0,0,0,0.5)",
      }}
    >
      <AlertTriangle size={16} />
      SERVER MAINTENANCE IMMINENT - GAME WILL PAUSE AFTER CURRENT DUEL
      <AlertTriangle size={16} />
    </div>
  );
};
