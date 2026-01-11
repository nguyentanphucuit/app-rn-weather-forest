import React, {createContext, useContext, useState, useEffect, ReactNode, useRef} from 'react';
import {WeatherAlert} from '../models/Weather';
import {sendWeatherAlertNotification, requestNotificationPermissions} from '../utils/notificationService';
import {API_ENDPOINTS, isApiEnabled, fetchWithTimeout} from '../utils/apiConfig';

interface AlertContextType {
  alerts: WeatherAlert[];
  activeAlerts: WeatherAlert[];
  loading: boolean;
  error: string | null;
  refreshAlerts: () => Promise<void>;
  dismissAlert: (alertId: string) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlerts = () => {
  const context = useContext(AlertContext);
  if (!context) {
    throw new Error('useAlerts must be used within an AlertProvider');
  }
  return context;
};

interface AlertProviderProps {
  children: ReactNode;
}

interface FloodRiskData {
  location_id: string;
  lat: number;
  lon: number;
  valid_at: string;
  relief_m: number | null;
  rain_1h_mm: number;
  rain_3h_mm: number;
  eff_rain_1h_mm: number;
  eff_rain_3h_mm: number;
  risk_score: number;
  risk_level: string;
}

interface FloodRiskResponse {
  count: number;
  data: FloodRiskData[];
}

// Map flood risk level sang severity
const mapRiskLevelToSeverity = (riskLevel: string): 'minor' | 'moderate' | 'severe' | 'extreme' => {
  switch (riskLevel) {
    case 'EXTREME':
      return 'extreme';
    case 'HIGH':
      return 'severe';
    case 'MEDIUM':
      return 'moderate';
    case 'LOW':
      return 'minor';
    default:
      return 'minor';
  }
};

// Map flood risk data sang WeatherAlert
const mapFloodRiskToAlert = (floodRisk: FloodRiskData): WeatherAlert => {
  const riskLabel = floodRisk.risk_level === 'NONE' ? 'Không có nguy cơ' :
                    floodRisk.risk_level === 'LOW' ? 'Nguy cơ thấp' :
                    floodRisk.risk_level === 'MEDIUM' ? 'Nguy cơ trung bình' :
                    floodRisk.risk_level === 'HIGH' ? 'Nguy cơ cao' :
                    'Nguy cơ cực cao';

  const description = `Nguy cơ lũ lụt: ${riskLabel}. ` +
    `Lượng mưa 1 giờ: ${floodRisk.rain_1h_mm.toFixed(1)}mm, ` +
    `3 giờ: ${floodRisk.rain_3h_mm.toFixed(1)}mm. ` +
    `Điểm nguy cơ: ${floodRisk.risk_score}` +
    (floodRisk.relief_m !== null ? `. Độ cao địa hình: ${floodRisk.relief_m.toFixed(1)}m` : '');

  return {
    id: `flood_risk_${floodRisk.location_id}`,
    title: `Cảnh báo lũ lụt - ${riskLabel}`,
    description: description,
    severity: mapRiskLevelToSeverity(floodRisk.risk_level),
    type: 'rain',
    startTime: floodRisk.valid_at,
    endTime: new Date(new Date(floodRisk.valid_at).getTime() + 24 * 60 * 60 * 1000).toISOString(), // Thêm 24h
    area: `${floodRisk.lat.toFixed(2)}, ${floodRisk.lon.toFixed(2)}`,
    urgency: 'expected',
  };
};

export const AlertProvider: React.FC<AlertProviderProps> = ({children}) => {
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const previousAlertsRef = useRef<Set<string>>(new Set());

  const fetchAlerts = async () => {
    try {
      setLoading(true);
      setError(null);

      let floodRiskData: FloodRiskData[] = [];

      // Thử gọi API trước
      if (isApiEnabled()) {
        try {
          const response = await fetchWithTimeout(API_ENDPOINTS.floodRiskLatest(), {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (response.ok) {
            const floodRiskResponse = await response.json() as FloodRiskResponse;
            floodRiskData = floodRiskResponse.data || [];
          } else {
            throw new Error(`API error: ${response.status}`);
          }
        } catch (apiError) {
          console.warn('API không phản hồi, sử dụng JSON file:', apiError);
          // Fallback về JSON file
          const floodRiskResponse = require('../data/flood_risk_latest.json') as FloodRiskResponse;
          floodRiskData = floodRiskResponse.data || [];
        }
      } else {
        // Nếu API không được enable, dùng JSON file luôn
        const floodRiskResponse = require('../data/flood_risk_latest.json') as FloodRiskResponse;
        floodRiskData = floodRiskResponse.data || [];
      }

      // Map tất cả các vị trí sang WeatherAlert (kể cả NONE để test)
      // Trong production, có thể filter bỏ NONE: .filter(item => item.risk_level !== 'NONE')
      const floodAlerts = floodRiskData
        .map(mapFloodRiskToAlert)
        .slice(0, 10); // Giới hạn 10 cảnh báo đầu tiên để test

      setAlerts(floodAlerts);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải cảnh báo lũ lụt');
      console.error('Error fetching flood risk alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();
    // Yêu cầu quyền thông báo khi app khởi động
    requestNotificationPermissions();
  }, []);

  const refreshAlerts = async () => {
    await fetchAlerts();
  };

  const dismissAlert = (alertId: string) => {
    setDismissedAlerts(prev => new Set([...prev, alertId]));
  };

  const activeAlerts = alerts.filter(
    alert => !dismissedAlerts.has(alert.id) && new Date(alert.endTime) > new Date(),
  );

  // Tự động gửi thông báo khi có cảnh báo mới
  useEffect(() => {
    const activeAlertIds = new Set(activeAlerts.map(alert => alert.id));

    // Tìm cảnh báo mới
    const newAlerts = activeAlerts.filter(
      alert => !previousAlertsRef.current.has(alert.id),
    );

    // Gửi thông báo cho mỗi cảnh báo mới
    newAlerts.forEach(async alert => {
      try {
        await sendWeatherAlertNotification(alert);
      } catch (error) {
        console.error('Lỗi khi gửi thông báo cảnh báo:', error);
      }
    });

    // Cập nhật previousAlerts
    previousAlertsRef.current = activeAlertIds;
  }, [activeAlerts]);

  return (
    <AlertContext.Provider
      value={{
        alerts,
        activeAlerts,
        loading,
        error,
        refreshAlerts,
        dismissAlert,
      }}>
      {children}
    </AlertContext.Provider>
  );
};

