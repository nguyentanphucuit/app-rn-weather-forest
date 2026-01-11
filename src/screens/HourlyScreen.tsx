import React, {useState, useEffect, useRef} from 'react';
import {View, Text, StyleSheet, FlatList, TouchableOpacity, Dimensions, ScrollView, Modal, Alert} from 'react-native';
import {useWeather} from '../providers/WeatherProvider';
import {useLocation} from '../providers/LocationProvider';
import {LoadingSpinner} from '../components/LoadingSpinner';
import {COLORS} from '../utils/colors';
import {SPACING, FONT_SIZE, BORDER_RADIUS} from '../utils/constants';
import {loadTimeseriesData} from '../utils/weatherDataApi';
import {formatTime} from '../utils/formatters';

const {width: SCREEN_WIDTH, height: SCREEN_HEIGHT} = Dimensions.get('window');

type ModelProvider = 'XGBoost' | 'LightGBM' | 'RidgeRegression' | 'GRU';

interface TimeseriesStep {
  valid_at: string;
  source: string;
  temp_c: number | null;
  wind_ms: number | null;
  precip_mm: number | null;
  rel_humidity_pct: number | null;
  wind_dir_deg: number | null;
  cloudcover_pct: number | null;
  surface_pressure_hpa: number | null;
}

const DEFAULT_LOCATION_ID = '400a5792-7432-4ab5-a280-97dd91b21621';

export const HourlyScreen: React.FC = () => {
  const {weatherData, loading} = useWeather();
  const {location} = useLocation();
  const [timeseriesSteps, setTimeseriesSteps] = useState<TimeseriesStep[]>([]);
  const [loadingTimeseries, setLoadingTimeseries] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedModel, setSelectedModel] = useState<ModelProvider>('XGBoost');
  const [showDateTimePicker, setShowDateTimePicker] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const flatListRef = useRef<FlatList>(null);

  useEffect(() => {
    const loadTimeseries = async () => {
      try {
        setLoadingTimeseries(true);
        const locationId = location?.location_id || DEFAULT_LOCATION_ID;
        const timeseriesData = await loadTimeseriesData(locationId, selectedModel);
        
        if (timeseriesData && timeseriesData.steps) {
          // Lấy TẤT CẢ các steps (48 giờ trước + 96 giờ tiếp theo)
          const allSteps = timeseriesData.steps
            .filter(step => step.temp_c !== null)
            .map(step => ({
              valid_at: step.valid_at,
              source: step.source,
              temp_c: step.temp_c,
              wind_ms: step.wind_ms,
              precip_mm: step.precip_mm,
              rel_humidity_pct: step.rel_humidity_pct,
              wind_dir_deg: step.wind_dir_deg,
              cloudcover_pct: step.cloudcover_pct,
              surface_pressure_hpa: step.surface_pressure_hpa,
            }));
          setTimeseriesSteps(allSteps);
        }
      } catch (error) {
        console.error('Error loading timeseries:', error);
      } finally {
        setLoadingTimeseries(false);
      }
    };

    if (location) {
      loadTimeseries();
    }
  }, [location, selectedModel]);

  // Phân loại steps: quá khứ, hiện tại, tương lai
  const now = new Date();
  const pastSteps = timeseriesSteps.filter(step => new Date(step.valid_at) < now);
  const currentStep = timeseriesSteps.find(step => {
    const stepTime = new Date(step.valid_at);
    const diff = Math.abs(stepTime.getTime() - now.getTime());
    return diff < 3600000; // Trong vòng 1 giờ
  });
  const futureSteps = timeseriesSteps.filter(step => new Date(step.valid_at) > now);

  // Tìm index của giờ hiện tại trong timeseriesSteps
  const currentStepIndex = currentStep 
    ? timeseriesSteps.findIndex(step => step.valid_at === currentStep.valid_at)
    : -1;
  const initialIndex = currentStepIndex >= 0 ? currentStepIndex : 0;

  // Scroll đến giờ hiện tại khi component mount - LUÔN GỌI (không có điều kiện)
  useEffect(() => {
    if (timeseriesSteps.length > 0 && currentStepIndex >= 0) {
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: currentStepIndex,
          animated: false,
        });
        setCurrentIndex(currentStepIndex);
      }, 100);
    }
  }, [timeseriesSteps.length, currentStepIndex]);

  if (loading && !weatherData) {
    return <LoadingSpinner message="Đang tải dự báo theo giờ..." />;
  }

  if (loadingTimeseries) {
    return <LoadingSpinner message="Đang tải dữ liệu timeseries..." />;
  }

  if (timeseriesSteps.length === 0 && (!weatherData || weatherData.hourly.length === 0)) {
    return (
      <View style={styles.container}>
        <View style={styles.modelSelectorContainer}>
          <Text style={styles.modelSelectorTitle}>Chọn Model Provider</Text>
          <ScrollView 
            horizontal 
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.modelButtonsContainer}>
            {(['XGBoost', 'LightGBM', 'RidgeRegression', 'GRU'] as ModelProvider[]).map(model => (
              <TouchableOpacity
                key={model}
                style={[
                  styles.modelButton,
                  selectedModel === model && styles.modelButtonActive,
                ]}
                onPress={() => setSelectedModel(model)}>
                <Text
                  style={[
                    styles.modelButtonText,
                    selectedModel === model && styles.modelButtonTextActive,
                  ]}>
                  {model}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Không có dữ liệu cho model {selectedModel}</Text>
        </View>
      </View>
    );
  }

  const getWindDirection = (degrees: number | null): string => {
    if (degrees === null) return '-';
    const directions = ['Bắc', 'ĐBắc', 'Đông', 'ĐNam', 'Nam', 'TNam', 'Tây', 'TBắc'];
    const index = Math.round(degrees / 45) % 8;
    return directions[index];
  };

  // Tính toán vị trí scroll để về giờ hiện tại
  const scrollToCurrent = () => {
    if (currentStepIndex < 0 || !flatListRef.current) return;
    
    flatListRef.current.scrollToIndex({
      index: currentStepIndex,
      animated: true,
    });
    setCurrentIndex(currentStepIndex);
  };

  // Sắp xếp tất cả steps theo thời gian (cần định nghĩa trước để dùng trong handleSearchDateTime)
  const allSteps = timeseriesSteps.length > 0 
    ? timeseriesSteps 
    : (weatherData?.hourly || []).map(forecast => ({
        valid_at: forecast.time,
        source: 'fcst',
        temp_c: forecast.temperature,
        wind_ms: forecast.windSpeed / 3.6,
        precip_mm: forecast.precipitation,
        rel_humidity_pct: forecast.humidity,
        wind_dir_deg: null,
        cloudcover_pct: null,
        surface_pressure_hpa: null,
      }));

  // Lấy min/max date từ allSteps
  const getMinMaxDates = () => {
    if (allSteps.length === 0) return {min: new Date(), max: new Date()};
    const dates = allSteps.map(step => new Date(step.valid_at));
    return {
      min: new Date(Math.min(...dates.map(d => d.getTime()))),
      max: new Date(Math.max(...dates.map(d => d.getTime()))),
    };
  };

  // const {min: minDate, max: maxDate} = getMinMaxDates(); // Reserved for future use

  // Lấy danh sách các ngày unique từ allSteps
  const getUniqueDates = () => {
    const dateMap = new Map<string, string>();
    allSteps.forEach(step => {
      const date = new Date(step.valid_at);
      const dateKey = date.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const dateLabel = date.toLocaleDateString('vi-VN', {
        weekday: 'long',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      if (!dateMap.has(dateKey)) {
        dateMap.set(dateKey, dateLabel);
      }
    });
    return Array.from(dateMap.entries()).sort((a, b) => {
      const dateA = new Date(a[0].split('/').reverse().join('-'));
      const dateB = new Date(b[0].split('/').reverse().join('-'));
      return dateA.getTime() - dateB.getTime();
    });
  };

  // Lấy danh sách các giờ có sẵn trong ngày đã chọn
  const getAvailableTimes = (dateStr: string) => {
    return allSteps
      .filter(step => {
        const stepDate = new Date(step.valid_at);
        const stepDateStr = stepDate.toLocaleDateString('vi-VN', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric',
        });
        return stepDateStr === dateStr;
      })
      .map(step => {
        const stepDate = new Date(step.valid_at);
        return {
          time: stepDate.toLocaleTimeString('vi-VN', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }),
          valid_at: step.valid_at,
        };
      })
      .sort((a, b) => a.time.localeCompare(b.time));
  };

  // Tìm kiếm theo ngày và giờ đã chọn
  const handleSearchDateTime = () => {
    if (!selectedDate || !selectedTime) {
      Alert.alert('Lỗi', 'Vui lòng chọn cả ngày và giờ');
      return;
    }

    // Tìm step chính xác với ngày và giờ đã chọn
    const targetIndex = allSteps.findIndex(step => {
      const stepDate = new Date(step.valid_at);
      const stepDateStr = stepDate.toLocaleDateString('vi-VN', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      const stepTime = stepDate.toLocaleTimeString('vi-VN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      return stepDateStr === selectedDate && stepTime === selectedTime;
    });

    if (targetIndex >= 0) {
      setShowDateTimePicker(false);
      setTimeout(() => {
        flatListRef.current?.scrollToIndex({
          index: targetIndex,
          animated: true,
        });
        setCurrentIndex(targetIndex);
      }, 100);
    } else {
      Alert.alert(
        'Không tìm thấy',
        'Không có dữ liệu cho thời gian đã chọn. Vui lòng chọn thời gian khác.',
      );
    }
  };

  const uniqueDates = getUniqueDates();
  const availableTimes = selectedDate ? getAvailableTimes(selectedDate) : [];

  const isFiniteNum = (v: unknown): v is number =>
    typeof v === 'number' && Number.isFinite(v);

  const clamp01 = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

  const getIsNight = (iso: string) => {
    const d = new Date(iso);
    const h = d.getHours(); // local time
    return h >= 18 || h < 6;
  };

  const buildCloudRainIcon = (step: TimeseriesStep) => {
    // cloudPct: 0..100, null => thiếu dữ liệu
    const cloudPct = isFiniteNum(step.cloudcover_pct)
      ? clamp01(step.cloudcover_pct, 0, 100)
      : null;

    // hasRain: giống logic web, "có mưa" khi precip_mm > 0 (có thể nâng ngưỡng nếu cần)
    const hasRain = isFiniteNum(step.precip_mm) && step.precip_mm > 0;

    const isNight = getIsNight(step.valid_at);

    // Nếu thiếu dữ liệu mây: vẫn ưu tiên mưa trước (nếu có), còn không thì unknown
    if (cloudPct === null) {
      if (hasRain) {
        return { icon: '🌧️', condition: isNight ? 'Mưa đêm' : 'Có mưa' };
      }
      return { icon: '❔', condition: 'Không có dữ liệu mây' };
    }

    // --- Mapping giống web ---
    // Web: default sun; nếu isNight -> moon (ở nhánh cuối)
    // Web: if (hasRain && 30<=cloud<=80) -> cloud-sun-rain / cloud-moon-rain
    if (hasRain && cloudPct >= 30 && cloudPct <= 80) {
      return {
        icon: isNight ? '🌧️' : '🌦️', // "cloud-moon-rain" vs "cloud-sun-rain"
        condition: 'Mưa rải rác',
      };
    }

    // Web: else if (hasRain) -> heavy showers
    if (hasRain) {
      return {
        icon: '⛈️', // "cloud-showers-heavy"
        condition: 'Mưa lớn',
      };
    }

    // Web: else if (!hasRain && cloudPct > 80) -> cloud
    if (!hasRain && cloudPct > 80) {
      return {
        icon: '☁️',
        condition: 'U ám',
      };
    }

    // Web: else if (!hasRain && cloudPct >= 30) -> cloud-sun / cloud-moon
    if (!hasRain && cloudPct >= 30) {
      return {
        icon: isNight ? '☁️' : '⛅', // "cloud-moon" vs "cloud-sun" - dùng ☁️ cho đêm để tránh emoji kép
        condition: cloudPct >= 60 ? 'Nhiều mây' : 'Có mây',
      };
    }

    // Web: else -> moon or sun
    return {
      icon: isNight ? '🌙' : '☀️',
      condition: 'Trời quang',
    };
  };

  // Render mỗi giờ
  const renderHour = ({item: step, index}: {item: TimeseriesStep; index: number}) => {
    const date = new Date(step.valid_at);
    const isObs = step.source === 'obs';
    const isCurrent = step.valid_at === currentStep?.valid_at;
    const { icon, condition } = buildCloudRainIcon(step);
    const dayNames = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
    const dayName = dayNames[date.getDay()];
    const dateStr = date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    
    // Xác định loại: quá khứ, hiện tại, tương lai
    const now = new Date();
    const stepTime = new Date(step.valid_at);
    const isPast = stepTime < now;
    const isFuture = stepTime > now;
    
    return (
      <ScrollView style={styles.hourContainer} showsVerticalScrollIndicator={false}>
        <View style={styles.headerContainer}>
          <View style={styles.headerLeft}>
            <Text style={styles.title}>Dự báo theo giờ</Text>
            <View style={styles.headerInfo}>
              <Text style={styles.dateText}>{dayName}, {dateStr}</Text>
              <Text style={styles.timeText}>{formatTime(step.valid_at)}</Text>
            </View>
          </View>
          <View style={[styles.pageIndicatorBadge, isCurrent && styles.pageIndicatorBadgeCurrent]}>
            <Text style={[styles.pageIndicator, isCurrent && styles.pageIndicatorCurrent]}>
              {index + 1}/{allSteps.length}
            </Text>
          </View>
        </View>

        <View style={[styles.detailCard, isCurrent && styles.detailCardCurrent, isPast && styles.detailCardPast]}>
          {/* Badges gộp lại */}
          <View style={styles.badgesRow}>
            <View style={[styles.badge, isObs && styles.badgeObs, isCurrent && styles.badgeCurrent]}>
              <Text style={[styles.badgeText, isCurrent && styles.badgeTextCurrent]}>
                {isObs ? '📊 Quan sát' : '🔮 Dự báo'}
              </Text>
            </View>
            {isPast && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>📅 Quá khứ</Text>
              </View>
            )}
            {isCurrent && (
              <View style={[styles.badge, styles.badgeCurrent]}>
                <Text style={[styles.badgeText, styles.badgeTextCurrent]}>✨ Hiện tại</Text>
              </View>
            )}
            {isFuture && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>🔮 Tương lai</Text>
              </View>
            )}
          </View>

          {/* Icon, Condition và Nhiệt độ gộp lại */}
          <View style={styles.mainInfo}>
            <Text style={styles.icon}>{icon}</Text>
            <View style={styles.tempCondition}>
              <Text style={[styles.tempValue, isPast && styles.tempValuePast, isCurrent && styles.tempValueCurrent]}>
                {step.temp_c !== null ? Math.round(step.temp_c) : '-'}°
              </Text>
              <Text style={styles.conditionText}>{condition}</Text>
            </View>
          </View>

          {/* Thông tin chi tiết - compact grid */}
          <View style={styles.detailsGrid}>
            {step.wind_ms !== null && (
              <View style={styles.detailBox}>
                <Text style={styles.detailBoxLabel}>💨 Gió</Text>
                <Text style={styles.detailBoxValue}>{Math.round(step.wind_ms * 3.6)} km/h</Text>
              </View>
            )}
            {step.wind_dir_deg !== null && (
              <View style={styles.detailBox}>
                <Text style={styles.detailBoxLabel}>🧭 Hướng</Text>
                <Text style={styles.detailBoxValue}>{getWindDirection(step.wind_dir_deg)}</Text>
              </View>
            )}
            {step.rel_humidity_pct !== null && (
              <View style={styles.detailBox}>
                <Text style={styles.detailBoxLabel}>💧 Ẩm</Text>
                <Text style={styles.detailBoxValue}>{Math.round(step.rel_humidity_pct)}%</Text>
              </View>
            )}
            {step.precip_mm !== null && step.precip_mm > 0 && (
              <View style={styles.detailBox}>
                <Text style={styles.detailBoxLabel}>🌧️ Mưa</Text>
                <Text style={styles.detailBoxValue}>{step.precip_mm.toFixed(1)}mm</Text>
              </View>
            )}
            {step.cloudcover_pct !== null && (
              <View style={styles.detailBox}>
                <Text style={styles.detailBoxLabel}>☁️ Mây</Text>
                <Text style={styles.detailBoxValue}>{Math.round(step.cloudcover_pct)}%</Text>
              </View>
            )}
            {step.surface_pressure_hpa !== null && (
              <View style={styles.detailBox}>
                <Text style={styles.detailBoxLabel}>📊 Áp suất</Text>
                <Text style={styles.detailBoxValue}>{Math.round(step.surface_pressure_hpa)}</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>
    );
  };


  return (
    <View style={styles.container}>
      {/* Model selector */}
      <View style={styles.modelSelectorContainer}>
        <View style={styles.modelSelectorHeader}>
          <Text style={styles.modelSelectorTitle}>Model Provider</Text>
          <TouchableOpacity
            style={styles.dateTimeButton}
            onPress={() => {
              setSelectedDate(null);
              setSelectedTime(null);
              setShowDateTimePicker(true);
            }}>
            <Text style={styles.dateTimeButtonText}>📅 Tìm theo ngày/giờ</Text>
          </TouchableOpacity>
        </View>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.modelButtonsContainer}>
          {(['XGBoost', 'LightGBM', 'RidgeRegression', 'GRU'] as ModelProvider[]).map(model => (
            <TouchableOpacity
              key={model}
              style={[
                styles.modelButton,
                selectedModel === model && styles.modelButtonActive,
              ]}
              onPress={() => {
                setSelectedModel(model);
                setLoadingTimeseries(true);
              }}>
              <Text
                style={[
                  styles.modelButtonText,
                  selectedModel === model && styles.modelButtonTextActive,
                ]}>
                {model}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        ref={flatListRef}
        data={allSteps}
        renderItem={renderHour}
        keyExtractor={(item, index) => `hour-${index}-${item.valid_at}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        onMomentumScrollEnd={(event) => {
          const index = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
          setCurrentIndex(index);
        }}
        onScrollToIndexFailed={(info) => {
          setTimeout(() => {
            flatListRef.current?.scrollToIndex({ index: info.index, animated: false });
          }, 100);
        }}
        getItemLayout={(data, index) => ({
          length: SCREEN_WIDTH,
          offset: SCREEN_WIDTH * index,
          index,
        })}
      />
      
      {/* Nút scroll về giờ hiện tại */}
      {currentStep && currentStepIndex >= 0 && (
        <TouchableOpacity
          style={styles.scrollToCurrentButton}
          onPress={scrollToCurrent}
          activeOpacity={0.8}>
          <Text style={styles.scrollToCurrentIcon}>⏰</Text>
          <Text style={styles.scrollToCurrentText}>Hiện tại</Text>
        </TouchableOpacity>
      )}

      {/* Modal chọn ngày/giờ */}
      <Modal
        visible={showDateTimePicker}
        transparent
        animationType="slide"
        onRequestClose={() => setShowDateTimePicker(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Tìm kiếm theo ngày/giờ</Text>
              <TouchableOpacity
                onPress={() => setShowDateTimePicker(false)}
                style={styles.modalCloseButton}>
                <Text style={styles.modalCloseText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>📅 Chọn ngày</Text>
                <View style={styles.dateListContainer}>
                  {uniqueDates.map(([dateKey, dateLabel]) => (
                    <TouchableOpacity
                      key={dateKey}
                      style={[
                        styles.dateItem,
                        selectedDate === dateKey && styles.dateItemSelected,
                      ]}
                      onPress={() => {
                        setSelectedDate(dateKey);
                        setSelectedTime(null); // Reset time khi chọn ngày mới
                      }}>
                      <Text
                        style={[
                          styles.dateItemText,
                          selectedDate === dateKey && styles.dateItemTextSelected,
                        ]}>
                        {dateLabel}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {selectedDate && (
                <View style={styles.inputGroup}>
                  <Text style={styles.inputLabel}>⏰ Chọn giờ</Text>
                  <View style={styles.timeListContainer}>
                    {availableTimes.map((timeItem, index) => (
                      <TouchableOpacity
                        key={`${timeItem.time}-${index}`}
                        style={[
                          styles.timeItem,
                          selectedTime === timeItem.time && styles.timeItemSelected,
                        ]}
                        onPress={() => setSelectedTime(timeItem.time)}>
                        <Text
                          style={[
                            styles.timeItemText,
                            selectedTime === timeItem.time && styles.timeItemTextSelected,
                          ]}>
                          {timeItem.time}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}

              <TouchableOpacity
                style={[
                  styles.searchButton,
                  (!selectedDate || !selectedTime) && styles.searchButtonDisabled,
                ]}
                onPress={handleSearchDateTime}
                disabled={!selectedDate || !selectedTime}>
                <Text style={styles.searchButtonText}>🔍 Tìm kiếm</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  hourContainer: {
    width: SCREEN_WIDTH,
    flex: 1,
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.sm,
  },
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: FONT_SIZE.xxl,
    color: COLORS.text,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: SPACING.xs,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING.sm,
  },
  dateText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  timeText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.primary,
    fontWeight: '700',
  },
  pageIndicatorBadge: {
    backgroundColor: COLORS.cardBackground,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginLeft: SPACING.sm,
  },
  pageIndicatorBadgeCurrent: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  pageIndicator: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  pageIndicatorCurrent: {
    color: COLORS.textDark,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
  detailCard: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.xs,
    marginBottom: SPACING.md,
    shadowColor: COLORS.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  detailCardCurrent: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    shadowColor: COLORS.shadowPrimary,
    shadowOpacity: 0.2,
  },
  detailCardPast: {
    opacity: 0.75,
  },
  badgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.xs,
    marginBottom: SPACING.md,
  },
  badge: {
    backgroundColor: COLORS.background,
    paddingHorizontal: SPACING.sm,
    paddingVertical: 4,
    borderRadius: BORDER_RADIUS.sm,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  badgeObs: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
  },
  badgeCurrent: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  badgeText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  badgeTextCurrent: {
    color: COLORS.textDark,
  },
  mainInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.lg,
    gap: SPACING.md,
  },
  icon: {
    fontSize: 56,
  },
  tempCondition: {
    alignItems: 'flex-start',
  },
  tempValue: {
    fontSize: FONT_SIZE.xxxl,
    color: COLORS.text,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: FONT_SIZE.xxxl * 1.1,
  },
  tempValuePast: {
    color: COLORS.textSecondary,
    fontSize: FONT_SIZE.xxl,
  },
  tempValueCurrent: {
    color: COLORS.primary,
  },
  conditionText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginTop: SPACING.xs,
  },
  detailsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  detailBox: {
    flex: 1,
    minWidth: '30%',
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  detailBoxLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginBottom: 2,
    textAlign: 'center',
  },
  detailBoxValue: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    fontWeight: '700',
  },
  scrollToCurrentButton: {
    position: 'absolute',
    bottom: SPACING.lg + 40,
    alignSelf: 'center',
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 6,
    borderWidth: 1.5,
    borderColor: COLORS.primaryDark,
  },
  scrollToCurrentIcon: {
    fontSize: FONT_SIZE.md,
    marginRight: SPACING.xs,
  },
  scrollToCurrentText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textDark,
    fontWeight: '700',
  },
  modelSelectorContainer: {
    backgroundColor: COLORS.cardBackground,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modelSelectorHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  modelSelectorTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  dateTimeButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
  },
  dateTimeButtonText: {
    color: COLORS.textDark,
    fontSize: FONT_SIZE.sm,
    fontWeight: '600',
  },
  modelButtonsContainer: {
    flexDirection: 'row',
    gap: SPACING.sm,
  },
  modelButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    minHeight: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modelButtonActive: {
    backgroundColor: COLORS.primary + '10',
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  modelButtonText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  modelButtonTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: COLORS.cardBackground,
    borderTopLeftRadius: BORDER_RADIUS.xl,
    borderTopRightRadius: BORDER_RADIUS.xl,
    paddingTop: SPACING.md,
    paddingBottom: SPACING.xl,
    maxHeight: SCREEN_HEIGHT * 0.85,
    height: SCREEN_HEIGHT * 0.85,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    paddingBottom: SPACING.md,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  modalTitle: {
    fontSize: FONT_SIZE.lg,
    fontWeight: '700',
    color: COLORS.text,
  },
  modalCloseButton: {
    padding: SPACING.xs,
  },
  modalCloseText: {
    fontSize: FONT_SIZE.xl,
    color: COLORS.textSecondary,
    fontWeight: '300',
  },
  modalBody: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.md,
    flex: 1,
    maxHeight: SCREEN_HEIGHT * 0.7,
  },
  dateListContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  dateItem: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minWidth: '45%',
  },
  dateItemSelected: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  dateItemText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    fontWeight: '500',
    textAlign: 'center',
  },
  dateItemTextSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  timeListContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
    marginTop: SPACING.xs,
  },
  timeItem: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    minWidth: '20%',
  },
  timeItemSelected: {
    backgroundColor: COLORS.primary + '20',
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  timeItemText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    fontWeight: '500',
    textAlign: 'center',
  },
  timeItemTextSelected: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  inputGroup: {
    marginBottom: SPACING.lg,
  },
  inputLabel: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  pickerButton: {
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: BORDER_RADIUS.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pickerButtonText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    fontWeight: '600',
  },
  pickerButtonIcon: {
    fontSize: FONT_SIZE.lg,
  },
  inputHint: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginTop: SPACING.xs,
  },
  searchButton: {
    backgroundColor: COLORS.primary,
    paddingVertical: SPACING.md,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    marginTop: SPACING.md,
  },
  searchButtonDisabled: {
    opacity: 0.5,
  },
  searchButtonText: {
    color: COLORS.textDark,
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
  },
});

