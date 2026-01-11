import React from 'react';
import {View, Text, StyleSheet, ScrollView, RefreshControl, TouchableOpacity, Alert} from 'react-native';
import {useWeather} from '../providers/WeatherProvider';
import {useAlerts} from '../providers/AlertProvider';
import {useLocation} from '../providers/LocationProvider';
import {Location} from '../models/Weather';
import {WeatherCard} from '../components/WeatherCard';
import {StatCard} from '../components/StatCard';
import {HourlyForecastCard} from '../components/HourlyForecastCard';
import {DailyForecastCard} from '../components/DailyForecastCard';
import {AlertCard} from '../components/AlertCard';
import {LoadingSpinner} from '../components/LoadingSpinner';
import {LocationSearchModal} from '../components/LocationSearchModal';
import {COLORS} from '../utils/colors';
import {SPACING, FONT_SIZE, BORDER_RADIUS} from '../utils/constants';
import {formatWindSpeed, formatPrecipitation} from '../utils/formatters';
import {
  scheduleNotification,
  sendWeatherAlertNotification,
  cancelAllScheduledNotifications,
  getScheduledNotificationsCount,
} from '../utils/notificationService';

export const HomeScreen: React.FC = () => {
  const {weatherData, loading, error, refreshWeather, temperatureUnit} = useWeather();
  const {activeAlerts} = useAlerts();
  const {location, updateLocation, requestLocation} = useLocation();
  const [refreshing, setRefreshing] = React.useState(false);
  const [showLocationModal, setShowLocationModal] = React.useState(false);
  const [testNotificationScheduled, setTestNotificationScheduled] = React.useState(false);
  const [resetting, setResetting] = React.useState(false);

  const onRefresh = React.useCallback(async () => {
    setRefreshing(true);
    await refreshWeather();
    setRefreshing(false);
  }, [refreshWeather]);

  if (loading && !weatherData) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingSpinner message="Đang tải dữ liệu thời tiết..." />
        <TouchableOpacity
          style={styles.selectLocationButton}
          onPress={() => setShowLocationModal(true)}>
          <Text style={styles.selectLocationButtonText}>Hoặc chọn vị trí thủ công</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (error || !weatherData) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error || 'Không thể tải dữ liệu thời tiết'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={refreshWeather}>
          <Text style={styles.retryButtonText}>Thử lại</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.selectLocationButton}
          onPress={() => setShowLocationModal(true)}>
          <Text style={styles.selectLocationButtonText}>Chọn vị trí</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const locationString = `${weatherData.location.city}, ${weatherData.location.country}`;

  const handleLocationSelect = (selectedLocation: Location) => {
    updateLocation(selectedLocation);
  };

  const handleTestNotification = async () => {
    try {
      // Lấy cảnh báo đầu tiên nếu có, nếu không thì dùng dữ liệu mẫu
      const testAlert = activeAlerts.length > 0 
        ? activeAlerts[0]
        : {
            id: 'test-alert',
            title: 'Cảnh báo mưa lớn',
            description: 'Dự báo có mưa lớn kèm gió mạnh trong vòng 2 giờ tới. Người dân cần chú ý và hạn chế di chuyển.',
            severity: 'moderate' as const,
            type: 'rain' as const,
            startTime: new Date(Date.now() + 7200000).toISOString(), // 2 giờ sau
            endTime: new Date(Date.now() + 10800000).toISOString(), // 3 giờ sau
            area: 'Hà Nội và các tỉnh lân cận',
            urgency: 'expected' as const,
          };

      // Sử dụng sendWeatherAlertNotification để format giống AlertCard
      // Nhưng vì cần schedule sau 10s, nên format thủ công
      const {getAlertUrgencyText} = await import('../utils/formatters');
      const urgencyText = getAlertUrgencyText(testAlert);
      
      // Format giống AlertCard: [SEVERITY] Title
      const severityText = testAlert.severity.toUpperCase();
      const severityEmoji = {
        extreme: '🔴',
        severe: '🟠',
        moderate: '🟡',
        minor: '🟢',
      };
      const emoji = severityEmoji[testAlert.severity] || '⚠️';
      
      const notificationId = await scheduleNotification(
        `${emoji} [${severityText}] ${testAlert.title}`,
        `${testAlert.description}\n\n📍 ${testAlert.area}\n⏰ ${urgencyText}`,
        10, // Sau 10 giây
        {
          type: 'weather_alert',
          alertId: testAlert.id,
          severity: testAlert.severity,
          area: testAlert.area,
          urgency: testAlert.urgency,
        },
      );

      if (notificationId) {
        setTestNotificationScheduled(true);
        Alert.alert(
          'Thông báo đã lên lịch',
          'Thông báo test sẽ hiển thị sau 10 giây. Hãy đợi và kiểm tra thông báo trên thiết bị của bạn.',
          [{text: 'OK'}],
        );
        
        // Reset sau 15 giây để có thể test lại
        setTimeout(() => {
          setTestNotificationScheduled(false);
        }, 15000);
      } else {
        Alert.alert(
          'Lỗi',
          'Không thể lên lịch thông báo. Vui lòng kiểm tra quyền thông báo trong cài đặt.',
          [{text: 'OK'}],
        );
      }
    } catch (error) {
      console.error('Lỗi khi test notification:', error);
      Alert.alert(
        'Lỗi',
        'Đã xảy ra lỗi khi lên lịch thông báo.',
        [{text: 'OK'}],
      );
    }
  };

  const handleResetNotifications = async () => {
    try {
      // Xác nhận trước khi reset
      Alert.alert(
        'Reset thông báo',
        'Bạn có chắc muốn hủy tất cả thông báo đã lên lịch?',
        [
          {text: 'Hủy', style: 'cancel'},
          {
            text: 'Reset',
            style: 'destructive',
            onPress: async () => {
              setResetting(true);
              try {
                const count = await getScheduledNotificationsCount();
                await cancelAllScheduledNotifications();
                Alert.alert(
                  'Đã reset',
                  `Đã hủy ${count} thông báo đã lên lịch.`,
                  [{text: 'OK'}],
                );
              } catch (error) {
                console.error('Lỗi khi reset notifications:', error);
                Alert.alert(
                  'Lỗi',
                  'Không thể reset thông báo.',
                  [{text: 'OK'}],
                );
              } finally {
                setResetting(false);
              }
            },
          },
        ],
      );
    } catch (error) {
      console.error('Lỗi khi reset notifications:', error);
    }
  };

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.locationButton}
          onPress={() => setShowLocationModal(true)}>
          <Text style={styles.locationIcon}>📍</Text>
          <Text style={styles.locationText} numberOfLines={1}>
            {locationString}
          </Text>
          <Text style={styles.locationChevron}>›</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
        {/* Active Alerts */}
      <View style={styles.alertsSection}>
        <View style={styles.alertsHeader}>
          <Text style={styles.sectionTitle}>⚠️ Cảnh báo thời tiết</Text>
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.testButton, testNotificationScheduled && styles.testButtonDisabled]}
              onPress={handleTestNotification}
              disabled={testNotificationScheduled}>
              <Text style={styles.testButtonText}>
                {testNotificationScheduled ? 'Đã lên lịch...' : '🔔 Test'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.resetButton, resetting && styles.resetButtonDisabled]}
              onPress={handleResetNotifications}
              disabled={resetting}>
              <Text style={styles.resetButtonText}>
                {resetting ? 'Đang reset...' : '🔄 Reset'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        {activeAlerts.length > 0 && activeAlerts.slice(0, 2).map(alert => (
          <AlertCard key={alert.id} alert={alert} />
        ))}
      </View>

      {/* Main Weather Card */}
      <WeatherCard
        weather={weatherData.current}
        location={locationString}
        temperatureUnit={temperatureUnit}
      />

      {/* Today Summary Card */}
      {weatherData.todaySummary && (
        <TouchableOpacity style={styles.summaryCard} activeOpacity={0.8}>
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryIcon}>📅</Text>
            <Text style={styles.summaryTitle}>Hôm nay</Text>
          </View>
          <Text style={styles.summaryText}>{weatherData.todaySummary}</Text>
        </TouchableOpacity>
      )}

      {/* Overall Alert Comment - Hiển thị luôn nếu có comment */}
      {weatherData.overallAlertComment && (
        <TouchableOpacity style={styles.overallAlertCard} activeOpacity={0.8}>
          <View style={styles.overallAlertHeader}>
            <Text style={styles.overallAlertIcon}>
              {weatherData.overallAlertLevel === 'extreme' ? '🔴' : 
               weatherData.overallAlertLevel === 'severe' ? '🟠' : 
               weatherData.overallAlertLevel === 'moderate' ? '🟡' : 
               weatherData.overallAlertLevel === 'none' ? '✅' : 'ℹ️'}
            </Text>
            <Text style={styles.overallAlertTitle}>
              {weatherData.overallAlertLevel === 'extreme' ? 'Cảnh báo cực kỳ nguy hiểm' :
               weatherData.overallAlertLevel === 'severe' ? 'Cảnh báo nghiêm trọng' :
               weatherData.overallAlertLevel === 'moderate' ? 'Cảnh báo vừa phải' : 
               weatherData.overallAlertLevel === 'none' ? 'Tình trạng thời tiết' : 'Thông tin thời tiết'}
            </Text>
          </View>
          <Text style={styles.overallAlertText}>{weatherData.overallAlertComment}</Text>
        </TouchableOpacity>
      )}

      {/* Stats Grid - Vertical Layout */}
      <View style={styles.statsContainer}>
        <View style={styles.statsRow}>
          <StatCard
            icon="💨"
            label="Tốc độ gió"
            value={formatWindSpeed(weatherData.current.windSpeed)}
          />
          <StatCard
            icon="💧"
            label="Độ ẩm"
            value={`${weatherData.current.humidity}%`}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            icon="🌡️"
            label="Nhiệt độ"
            value={`${Math.round(weatherData.current.feelsLike)}°${temperatureUnit}`}
          />
          <StatCard
            icon="👁️"
            label="Tầm nhìn"
            value={`${weatherData.current.visibility} km`}
          />
        </View>
        <View style={styles.statsRow}>
          <StatCard
            icon="📊"
            label="Áp suất"
            value={`${weatherData.current.pressure} hPa`}
          />
          <StatCard
            icon="☀️"
            label="Chỉ số UV"
            value={weatherData.current.uvIndex.toString()}
          />
        </View>
      </View>

      {/* Hourly Forecast */}
      {weatherData.hourly.length > 0 && (
        <HourlyForecastCard
          forecasts={weatherData.hourly.slice(0, 24)}
          temperatureUnit={temperatureUnit}
        />
      )}

      {/* Daily Forecast Preview */}
      <View style={styles.dailySection}>
        <Text style={styles.sectionTitle}>Dự báo theo ngày</Text>
        {weatherData.daily.slice(0, 3).map((forecast, index) => (
          <DailyForecastCard
            key={index}
            forecast={forecast}
            temperatureUnit={temperatureUnit}
          />
        ))}
      </View>
      </ScrollView>

      <LocationSearchModal
        visible={showLocationModal}
        onClose={() => setShowLocationModal(false)}
        onSelectLocation={handleLocationSelect}
        currentLocation={location}
      />
    </>
  );
};

const styles = StyleSheet.create({
  header: {
    backgroundColor: COLORS.cardBackground,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.border,
  },
  locationButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.sm,
    paddingHorizontal: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  locationIcon: {
    fontSize: FONT_SIZE.lg,
    marginRight: SPACING.sm,
  },
  locationText: {
    flex: 1,
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
    color: COLORS.text,
    marginLeft: SPACING.sm,
  },
  locationChevron: {
    fontSize: FONT_SIZE.xl,
    color: COLORS.textSecondary,
    marginLeft: SPACING.xs,
    fontWeight: '300',
  },
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    paddingBottom: SPACING.xl,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  errorText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.error,
    textAlign: 'center',
    marginBottom: SPACING.md,
  },
  retryButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    shadowColor: COLORS.primary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  retryButtonText: {
    color: COLORS.textDark,
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  selectLocationButton: {
    marginTop: SPACING.lg,
    paddingHorizontal: SPACING.xl,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    shadowColor: COLORS.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  selectLocationButtonText: {
    color: COLORS.primary,
    fontSize: FONT_SIZE.md,
    fontWeight: '600',
  },
  alertsSection: {
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  alertsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.lg,
    marginTop: SPACING.lg,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.xxxl,
    color: COLORS.text,
    fontWeight: '800',
    flex: 1,
    letterSpacing: -1.2,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  testButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    shadowColor: COLORS.primary,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  testButtonDisabled: {
    backgroundColor: COLORS.textSecondary,
    opacity: 0.6,
  },
  testButtonText: {
    color: COLORS.textDark,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  resetButton: {
    backgroundColor: COLORS.error || '#FF3B30',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    shadowColor: COLORS.error || '#FF3B30',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 3,
  },
  resetButtonDisabled: {
    backgroundColor: COLORS.textSecondary,
    opacity: 0.6,
  },
  resetButtonText: {
    color: COLORS.textDark,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  statsContainer: {
    marginHorizontal: SPACING.md,
    marginVertical: SPACING.sm,
  },
  statsRow: {
    flexDirection: 'row',
    marginBottom: SPACING.sm,
  },
  dailySection: {
    marginTop: SPACING.sm,
  },
  summaryCard: {
    backgroundColor: COLORS.cardBackground,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  summaryIcon: {
    fontSize: FONT_SIZE.lg,
    marginRight: SPACING.sm,
  },
  summaryTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.text,
  },
  summaryText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  overallAlertCard: {
    backgroundColor: COLORS.cardBackground,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.sm,
    marginBottom: SPACING.sm,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    shadowColor: COLORS.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  overallAlertHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  overallAlertIcon: {
    fontSize: FONT_SIZE.xl,
    marginRight: SPACING.sm,
  },
  overallAlertTitle: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    color: COLORS.text,
    flex: 1,
  },
  overallAlertText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    lineHeight: 20,
  },
});

