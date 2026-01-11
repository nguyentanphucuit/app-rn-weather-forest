import React, {createContext, useContext, useState, useEffect, ReactNode, useRef} from 'react';
import {WeatherData} from '../models/Weather';
import {fetchWeatherFromJson} from '../utils/weatherDataApi';
import {useLocation} from './LocationProvider';
import {
  sendOverallAlertNotification,
  requestNotificationPermissions,
  scheduleRecurringWeatherNotifications,
  autoRescheduleIfNeeded,
  getScheduledNotificationsCount,
} from '../utils/notificationService';

interface WeatherContextType {
  weatherData: WeatherData | null;
  loading: boolean;
  error: string | null;
  refreshWeather: () => Promise<void>;
  temperatureUnit: 'C' | 'F';
  setTemperatureUnit: (unit: 'C' | 'F') => void;
}

const WeatherContext = createContext<WeatherContextType | undefined>(undefined);

export const useWeather = () => {
  const context = useContext(WeatherContext);
  if (!context) {
    throw new Error('useWeather must be used within a WeatherProvider');
  }
  return context;
};

interface WeatherProviderProps {
  children: ReactNode;
}

export const WeatherProvider: React.FC<WeatherProviderProps> = ({children}) => {
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [temperatureUnit, setTemperatureUnit] = useState<'C' | 'F'>('C');
  const {location} = useLocation();
  const previousOverallAlertRef = useRef<string | null>(null);
  const scheduledNotificationsRef = useRef<string[]>([]);
  const isSchedulingRef = useRef<boolean>(false);

  const fetchWeatherData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      if (!location) {
        setError('Vị trí không khả dụng. Vui lòng chọn vị trí thủ công.');
        setLoading(false);
        return;
      }

      // Fetch from JSON files dựa trên location_id (sẽ fallback về mặc định nếu không có)
      // Default provider là XGBoost
      const data = await fetchWeatherFromJson(location, 'XGBoost');
      
      setWeatherData(data);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Không thể tải dữ liệu thời tiết';
      setError(errorMessage);
      console.error('Weather fetch error:', err);
      // Đảm bảo loading được set về false ngay cả khi có lỗi
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (location) {
      fetchWeatherData();
    }
    // Yêu cầu quyền thông báo khi app khởi động
    requestNotificationPermissions();
  }, [location]);

  // Helper function để schedule notifications
  const scheduleNotifications = async () => {
    if (!weatherData?.overallAlertComment) {
      return;
    }

    // Tránh schedule nhiều lần cùng lúc
    if (isSchedulingRef.current) {
      console.log('⏳ Đang schedule, bỏ qua lần gọi này...');
      return;
    }

    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return;
    }

    // Kiểm tra xem đã có notifications chưa - nếu có rồi thì không schedule lại
    const existingCount = await getScheduledNotificationsCount();
    if (existingCount > 10) {
      console.log(`⏭️ Đã có ${existingCount} notifications, bỏ qua schedule mới`);
      return;
    }

    isSchedulingRef.current = true;

    try {
      const NOTIFICATION_INTERVAL_MINUTES = 30;
      const getNotificationContent = () => {
        const level = weatherData.overallAlertLevel || 'none';
        const levelConfig = {
          extreme: {emoji: '🔴', title: 'Cảnh báo cực kỳ nguy hiểm'},
          severe: {emoji: '🟠', title: 'Cảnh báo nghiêm trọng'},
          moderate: {emoji: '🟡', title: 'Cảnh báo vừa phải'},
          none: {emoji: '✅', title: 'Tình trạng thời tiết'},
          default: {emoji: 'ℹ️', title: 'Thông tin thời tiết'},
        };
        const config = levelConfig[level as keyof typeof levelConfig] || levelConfig.default;
        return {
          title: `${config.emoji} ${config.title}`,
          body: weatherData.overallAlertComment || 'Không có thông tin thời tiết',
          data: {
            type: 'recurring_weather_update',
            level: level,
            location: weatherData.location.city,
          },
        };
      };

      // Chỉ cancel existing nếu chưa có notifications (để tránh reset mỗi lần mở app)
      const shouldCancelExisting = existingCount === 0;
      const ids = await scheduleRecurringWeatherNotifications(
        NOTIFICATION_INTERVAL_MINUTES,
        getNotificationContent,
        shouldCancelExisting, // Chỉ cancel nếu chưa có notifications
      );
      scheduledNotificationsRef.current = ids;
    } catch (error) {
      console.error('Lỗi khi schedule thông báo định kỳ:', error);
    } finally {
      isSchedulingRef.current = false;
    }
  };

  // Schedule thông báo định kỳ mỗi 30 phút khi có weatherData
  // Chỉ schedule lần đầu khi chưa có notifications
  useEffect(() => {
    scheduleNotifications();
  }, [weatherData?.overallAlertComment, weatherData?.overallAlertLevel, weatherData?.location?.city]);

  // Tự động kiểm tra và schedule lại nếu còn ít notifications (khi app mở hoặc định kỳ)
  useEffect(() => {
    if (!weatherData?.overallAlertComment) {
      return;
    }

    const checkAndReschedule = async () => {
      const NOTIFICATION_INTERVAL_MINUTES = 10;
      const getNotificationContent = () => {
        const level = weatherData.overallAlertLevel || 'none';
        const levelConfig = {
          extreme: {emoji: '🔴', title: 'Cảnh báo cực kỳ nguy hiểm'},
          severe: {emoji: '🟠', title: 'Cảnh báo nghiêm trọng'},
          moderate: {emoji: '🟡', title: 'Cảnh báo vừa phải'},
          none: {emoji: '✅', title: 'Tình trạng thời tiết'},
          default: {emoji: 'ℹ️', title: 'Thông tin thời tiết'},
        };
        const config = levelConfig[level as keyof typeof levelConfig] || levelConfig.default;
        return {
          title: `${config.emoji} ${config.title}`,
          body: weatherData.overallAlertComment || 'Không có thông tin thời tiết',
          data: {
            type: 'recurring_weather_update',
            level: level,
            location: weatherData.location.city,
          },
        };
      };

      // Kiểm tra số lượng notifications còn lại
      const count = await getScheduledNotificationsCount();
      console.log(`📊 Số notifications còn lại: ${count}`);

      // Tự động schedule lại nếu còn ít hơn 10 notifications
      await autoRescheduleIfNeeded(NOTIFICATION_INTERVAL_MINUTES, getNotificationContent, 10);
    };

    // Kiểm tra ngay khi có weatherData
    checkAndReschedule();

    // Kiểm tra định kỳ mỗi 1 giờ
    const interval = setInterval(checkAndReschedule, 60 * 60 * 1000); // 1 giờ

    return () => clearInterval(interval);
  }, [weatherData?.overallAlertComment, weatherData?.overallAlertLevel, weatherData?.location?.city]);

  // Tự động gửi thông báo khi overallAlertComment thay đổi
  useEffect(() => {
    if (!weatherData?.overallAlertComment) {
      return;
    }

    // Tạo key để so sánh (level + comment)
    const currentKey = `${weatherData.overallAlertLevel || 'none'}_${weatherData.overallAlertComment}`;

    // Chỉ gửi nếu thay đổi so với lần trước
    if (previousOverallAlertRef.current !== currentKey) {
      // Gửi thông báo cho tất cả các level (bao gồm cả 'none' như trong hình)
      sendOverallAlertNotification(
        weatherData.overallAlertLevel || 'none',
        weatherData.overallAlertComment,
        weatherData.location.city,
      ).catch(error => {
        console.error('Lỗi khi gửi thông báo overall alert:', error);
      });

      previousOverallAlertRef.current = currentKey;
    }
  }, [weatherData?.overallAlertLevel, weatherData?.overallAlertComment, weatherData?.location?.city]);

  const refreshWeather = async () => {
    await fetchWeatherData();
  };

  return (
    <WeatherContext.Provider
      value={{
        weatherData,
        loading,
        error,
        refreshWeather,
        temperatureUnit,
        setTemperatureUnit,
      }}>
      {children}
    </WeatherContext.Provider>
  );
};

