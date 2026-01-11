import * as Notifications from 'expo-notifications';
import {Platform} from 'react-native';
import {WeatherAlert} from '../models/Weather';
import {getAlertUrgencyText} from '../utils/formatters';

// Cấu hình notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/**
 * Yêu cầu quyền thông báo
 */
export const requestNotificationPermissions = async (): Promise<boolean> => {
  try {
    const {status: existingStatus} = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const {status} = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Người dùng không cấp quyền thông báo');
      return false;
    }

    // Cấu hình channel cho Android
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('weather-alerts', {
        name: 'Cảnh báo thời tiết',
        importance: Notifications.AndroidImportance.HIGH,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
        sound: 'default',
        enableVibrate: true,
        showBadge: true,
      });
    }

    return true;
  } catch (error) {
    console.error('Lỗi khi yêu cầu quyền thông báo:', error);
    return false;
  }
};

/**
 * Gửi thông báo ngay lập tức
 */
export const sendNotification = async (
  title: string,
  body: string,
  data?: any,
): Promise<string | null> => {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return null;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: null, // null = hiển thị ngay lập tức
    });

    return notificationId;
  } catch (error) {
    console.error('Lỗi khi gửi thông báo:', error);
    return null;
  }
};

/**
 * Lên lịch thông báo sau một khoảng thời gian (giây)
 */
export const scheduleNotification = async (
  title: string,
  body: string,
  seconds: number,
  data?: any,
): Promise<string | null> => {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return null;
    }

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data: data || {},
        sound: true,
        priority: Notifications.AndroidNotificationPriority.HIGH,
      },
      trigger: {
        seconds: seconds,
      },
    });

    return notificationId;
  } catch (error) {
    console.error('Lỗi khi lên lịch thông báo:', error);
    return null;
  }
};

/**
 * Gửi thông báo cảnh báo thời tiết - Format giống AlertCard
 */
export const sendWeatherAlertNotification = async (
  alert: WeatherAlert,
): Promise<string | null> => {
  // Severity emoji và text giống AlertCard
  const severityConfig = {
    extreme: {emoji: '🔴', text: 'EXTREME'},
    severe: {emoji: '🟠', text: 'SEVERE'},
    moderate: {emoji: '🟡', text: 'MODERATE'},
    minor: {emoji: '🟢', text: 'MINOR'},
  };

  const config = severityConfig[alert.severity] || {emoji: '⚠️', text: 'ALERT'};
  const urgencyText = getAlertUrgencyText(alert);

  // Format title: Emoji + Severity + Title
  const title = `${config.emoji} [${config.text}] ${alert.title}`;

  // Format body: Description + Area + Urgency (giống AlertCard footer)
  const body = `${alert.description}\n\n📍 ${alert.area}\n⏰ ${urgencyText}`;

  return await sendNotification(
    title,
    body,
    {
      type: 'weather_alert',
      alertId: alert.id,
      severity: alert.severity,
      area: alert.area,
      urgency: alert.urgency,
      startTime: alert.startTime,
      endTime: alert.endTime,
    },
  );
};

/**
 * Gửi thông báo tình trạng thời tiết tổng thể - Format giống Overall Alert Card
 */
export const sendOverallAlertNotification = async (
  level: string,
  comment: string,
  location?: string,
): Promise<string | null> => {
  // Icon và title giống Overall Alert Card trong HomeScreen
  const levelConfig = {
    extreme: {emoji: '🔴', title: 'Cảnh báo cực kỳ nguy hiểm'},
    severe: {emoji: '🟠', title: 'Cảnh báo nghiêm trọng'},
    moderate: {emoji: '🟡', title: 'Cảnh báo vừa phải'},
    none: {emoji: '✅', title: 'Tình trạng thời tiết'},
    default: {emoji: 'ℹ️', title: 'Thông tin thời tiết'},
  };

  const config = levelConfig[level as keyof typeof levelConfig] || levelConfig.default;

  // Format title: Emoji + Title
  const title = `${config.emoji} ${config.title}`;

  // Format body: Comment (giống Overall Alert Card)
  const body = comment;

  return await sendNotification(
    title,
    body,
    {
      type: 'overall_alert',
      level: level,
      comment: comment,
      location: location,
    },
  );
};

/**
 * Tính thời điểm bắt đầu schedule dựa trên interval (phút)
 * Đảm bảo schedule vào các mốc thời gian cố định chia hết cho interval
 * Ví dụ: interval = 30 → bắt đầu từ :00 hoặc :30 (14:00, 14:30, 15:00, 15:30, ...)
 *        interval = 15 → bắt đầu từ :00, :15, :30, hoặc :45
 *        interval = 1 → bắt đầu từ phút tiếp theo (:00, :01, :02, ..., :59)
 */
const calculateStartTime = (intervalMinutes: number): {hour: number; minute: number; baseDate: Date} => {
  const now = new Date();
  const currentMinutes = now.getMinutes();
  const currentHours = now.getHours();

  // Tính minute tiếp theo chia hết cho interval
  // Ví dụ: hiện tại 14:23, interval = 30 → nextInterval = 30 (14:30)
  //        hiện tại 14:30, interval = 30 → nextInterval = 60 (15:00)
  //        hiện tại 14:45, interval = 30 → nextInterval = 60 (15:00)
  let nextInterval = Math.ceil((currentMinutes + 1) / intervalMinutes) * intervalMinutes;
  
  let targetHour = currentHours;
  let targetMinute = nextInterval;
  
  // Nếu vượt quá 60 phút, chuyển sang giờ tiếp theo
  if (targetMinute >= 60) {
    targetHour = (targetHour + 1) % 24;
    targetMinute = targetMinute % 60;
  }

  // Tạo Date object cho mốc thời gian đầu tiên
  const baseDate = new Date();
  baseDate.setHours(targetHour, targetMinute, 0, 0);
  
  // Nếu thời gian đã qua trong ngày hôm nay, chuyển sang ngày mai
  if (baseDate <= now) {
    baseDate.setDate(baseDate.getDate() + 1);
  }

  return {
    hour: targetHour,
    minute: targetMinute,
    baseDate: baseDate,
  };
};

/**
 * Tính số lần schedule dựa trên interval và số ngày
 * @param intervalMinutes - Khoảng thời gian giữa các thông báo (phút)
 * @param days - Số ngày cần schedule (mặc định: 30 ngày)
 */
const calculateScheduleCount = (intervalMinutes: number, days: number = 30): number => {
  const minutesPerDay = 24 * 60;
  const totalMinutes = minutesPerDay * days;
  return Math.floor(totalMinutes / intervalMinutes);
};

/**
 * Lên lịch thông báo định kỳ với interval tùy chỉnh (phút)
 * @param intervalMinutes - Khoảng thời gian giữa các thông báo (phút). Ví dụ: 15, 30, 60
 * @param getNotificationContent - Function trả về nội dung thông báo
 * @param cancelExisting - Có hủy các notification cũ không (mặc định: true)
 */
export const scheduleRecurringWeatherNotifications = async (
  intervalMinutes: number,
  getNotificationContent: () => {title: string; body: string; data?: any},
  cancelExisting: boolean = true,
): Promise<string[]> => {
  try {
    const hasPermission = await requestNotificationPermissions();
    if (!hasPermission) {
      return [];
    }

    // Validate interval
    if (intervalMinutes <= 0 || intervalMinutes > 1440) {
      console.error('Interval phải từ 1 đến 1440 phút (24 giờ)');
      return [];
    }

    // Hủy tất cả notification cũ trước khi schedule mới
    if (cancelExisting) {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }

    const notificationIds: string[] = [];
    const now = new Date();
    
    // Tính thời điểm bắt đầu (mốc cố định đầu tiên)
    const startTime = calculateStartTime(intervalMinutes);
    
    // Tính số lần schedule
    // LƯU Ý: Giới hạn là của THIẾT BỊ, không phải Expo:
    // - iOS: Tối đa 64 scheduled notifications (giới hạn cứng của iOS)
    // - Android: Không có giới hạn cứng, có thể schedule nhiều hơn
    // - Expo: Không có giới hạn, chỉ là wrapper cho native APIs
    
    // Áp dụng giới hạn khác nhau cho từng platform
    // Giảm giới hạn để tránh quá tải dev server và lỗi PayloadTooLargeError
    const MAX_NOTIFICATIONS_IOS = 64; // Giới hạn cứng của iOS
    const MAX_NOTIFICATIONS_ANDROID = 200; // Giảm xuống 200 để tránh quá tải (tương đương ~4 ngày)
    const MAX_NOTIFICATIONS = Platform.OS === 'ios' ? MAX_NOTIFICATIONS_IOS : MAX_NOTIFICATIONS_ANDROID;
    
    const SCHEDULE_DAYS = 30; // Số ngày muốn schedule
    
    let scheduleCount = calculateScheduleCount(intervalMinutes, SCHEDULE_DAYS);
    
    // Áp dụng giới hạn của thiết bị
    if (scheduleCount > MAX_NOTIFICATIONS) {
      console.warn(
        `⚠️ Số lượng notification (${scheduleCount}) vượt quá giới hạn ${Platform.OS === 'ios' ? 'iOS' : 'Android'} (${MAX_NOTIFICATIONS}). ` +
        `Chỉ schedule ${MAX_NOTIFICATIONS} notification đầu tiên. ` +
        `Giới hạn này là của hệ điều hành, không phải Expo.`
      );
      scheduleCount = MAX_NOTIFICATIONS;
    }
    
    // Tính số ngày thực tế sẽ được schedule
    const actualDays = Math.ceil((scheduleCount * intervalMinutes) / (24 * 60));
    
    // Giảm log để tránh quá tải dev server
    if (scheduleCount <= 100 || scheduleCount % 50 === 0) {
      console.log(
        `📅 [${Platform.OS.toUpperCase()}] Sẽ schedule ${scheduleCount} thông báo mỗi ${intervalMinutes} phút ` +
        `(khoảng ${actualDays} ngày, giới hạn: ${MAX_NOTIFICATIONS})`
      );
    }

    // Lấy nội dung thông báo một lần (sẽ dùng cho tất cả notification)
    const content = getNotificationContent();

    let successCount = 0;
    let errorCount = 0;
    let consecutiveErrors = 0; // Đếm số lỗi liên tiếp
    const MAX_CONSECUTIVE_ERRORS = 5; // Dừng lại sau 5 lỗi liên tiếp

    // Schedule các thông báo vào các mốc thời gian cố định
    // Ví dụ: interval = 30 → 14:30, 15:00, 15:30, 16:00, ...
    //        interval = 1 → 14:24, 14:25, 14:26, 14:27, ... (nếu hiện tại là 14:23)
    for (let i = 0; i < scheduleCount; i++) {
      // Dừng lại nếu có quá nhiều lỗi liên tiếp (có thể đã đạt giới hạn)
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
        console.warn(
          `⚠️ Dừng schedule: Gặp ${MAX_CONSECUTIVE_ERRORS} lỗi liên tiếp. ` +
          `Có thể đã đạt giới hạn hệ thống. Đã schedule ${successCount} notifications.`
        );
        break;
      }

      try {
        // Tính thời điểm target dựa trên mốc đầu tiên + i * interval
        // startTime.baseDate đã là mốc đầu tiên chia hết cho interval
        const targetTime = new Date(startTime.baseDate);
        targetTime.setMinutes(targetTime.getMinutes() + i * intervalMinutes);

        // Tính số giây cần đợi từ bây giờ đến targetTime
        const secondsUntil = Math.floor((targetTime.getTime() - now.getTime()) / 1000);

        // Schedule nếu thời gian trong tương lai
        // MIN_SECONDS = 60 giây (1 phút) để đảm bảo notification đầu tiên luôn được schedule
        // Điều kiện baseDate <= now trong calculateStartTime đã đảm bảo không schedule vào quá khứ
        const MIN_SECONDS = 60; // Ít nhất 1 phút để tránh hiển thị ngay lập tức
        const MAX_SECONDS = 30 * 24 * 60 * 60; // 30 ngày
        if (secondsUntil >= MIN_SECONDS && secondsUntil <= MAX_SECONDS) {
          const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
              title: content.title,
              body: content.body,
              data: {
                ...content.data,
                scheduledTime: targetTime.toISOString(),
                intervalMinutes: intervalMinutes,
              },
              sound: true,
              priority: Notifications.AndroidNotificationPriority.HIGH,
            },
            trigger: {
              seconds: secondsUntil,
              repeats: false,
            },
          });

          notificationIds.push(notificationId);
          successCount++;
          consecutiveErrors = 0; // Reset counter khi thành công
          
          // Giảm log để tránh quá tải dev server - chỉ log một số mốc quan trọng
          if (i < 3 || (i < 50 && i % 25 === 0) || i % 50 === 0) {
            const timeStr = `${String(targetTime.getHours()).padStart(2, '0')}:${String(targetTime.getMinutes()).padStart(2, '0')}`;
            console.log(`  → Notification #${i + 1}: ${timeStr}`);
          }
        }
      } catch (error) {
        errorCount++;
        consecutiveErrors++;
        // Chỉ log lỗi cho 5 lần đầu để tránh spam log
        if (errorCount <= 5 || consecutiveErrors === MAX_CONSECUTIVE_ERRORS) {
          console.error(`Lỗi khi schedule notification #${i + 1}:`, error);
        }
        // Tiếp tục schedule các notification khác
      }
    }

    console.log(
      `Đã schedule ${successCount}/${scheduleCount} thông báo định kỳ mỗi ${intervalMinutes} phút. ` +
      `Lỗi: ${errorCount}`
    );
    
    if (errorCount > 0) {
      console.warn(
        `Có ${errorCount} notification không thể schedule. ` +
        `Có thể do giới hạn hệ thống hoặc interval quá nhỏ.`
      );
    }

    return notificationIds;
  } catch (error) {
    console.error('Lỗi khi lên lịch thông báo định kỳ:', error);
    return [];
  }
};

/**
 * Hủy tất cả thông báo đã lên lịch
 */
export const cancelAllScheduledNotifications = async (): Promise<void> => {
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (error) {
    console.error('Lỗi khi hủy thông báo:', error);
  }
};

/**
 * Lấy số lượng notifications đã schedule còn lại
 */
export const getScheduledNotificationsCount = async (): Promise<number> => {
  try {
    const notifications = await Notifications.getAllScheduledNotificationsAsync();
    return notifications.length;
  } catch (error) {
    console.error('Lỗi khi lấy số lượng notifications:', error);
    return 0;
  }
};

/**
 * Kiểm tra và tự động schedule lại nếu còn ít notifications
 * @param intervalMinutes - Interval của notifications
 * @param getNotificationContent - Function trả về nội dung thông báo
 * @param threshold - Ngưỡng tối thiểu để schedule lại (mặc định: 10)
 */
export const autoRescheduleIfNeeded = async (
  intervalMinutes: number,
  getNotificationContent: () => {title: string; body: string; data?: any},
  threshold: number = 10,
): Promise<boolean> => {
  try {
    const count = await getScheduledNotificationsCount();
    
    if (count < threshold) {
      console.log(
        `🔄 Tự động schedule lại: Còn ${count} notifications (dưới ngưỡng ${threshold})`
      );
      
      // Schedule lại (không cancel existing để tránh mất notifications đang chờ)
      await scheduleRecurringWeatherNotifications(
        intervalMinutes,
        getNotificationContent,
        false, // Không cancel existing
      );
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Lỗi khi tự động schedule lại:', error);
    return false;
  }
};
