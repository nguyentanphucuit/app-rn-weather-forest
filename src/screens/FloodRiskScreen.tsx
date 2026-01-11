import React, {useState, useEffect} from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity, FlatList} from 'react-native';
import {LoadingSpinner} from '../components/LoadingSpinner';
import {COLORS} from '../utils/colors';
import {SPACING, FONT_SIZE, BORDER_RADIUS} from '../utils/constants';
import {useLocation} from '../providers/LocationProvider';
import {API_ENDPOINTS, isApiEnabled, fetchWithTimeout} from '../utils/apiConfig';
import {loadVietnamProvinces, getProvinceByLocationId, getProvinceByCoordinates} from '../utils/vietnamProvinces';

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

export const FloodRiskScreen: React.FC = () => {
  const {location} = useLocation();
  const [floodRiskData, setFloodRiskData] = useState<FloodRiskData[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRisk, setSelectedRisk] = useState<string | null>(null);
  const [provincesLoaded, setProvincesLoaded] = useState(false);

  useEffect(() => {
    const loadFloodRiskData = async () => {
      try {
        setLoading(true);
        
        // Load provinces trước để có thể map tọa độ sang tên
        await loadVietnamProvinces();
        setProvincesLoaded(true);
        
        // Thử gọi API trước
        if (isApiEnabled()) {
          try {
            const response = await fetchWithTimeout(API_ENDPOINTS.floodRiskLatest());
            if (response.ok) {
              const floodRiskResponse = await response.json() as FloodRiskResponse;
              setFloodRiskData(floodRiskResponse.data || []);
              return;
            }
          } catch (apiError) {
            console.warn('API không phản hồi, sử dụng JSON file:', apiError);
          }
        }
        
        // Fallback về JSON file
        const floodRiskResponse = require('../data/flood_risk_latest.json') as FloodRiskResponse;
        setFloodRiskData(floodRiskResponse.data || []);
      } catch (error) {
        console.error('Error loading flood risk data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadFloodRiskData();
  }, []);

  if (loading) {
    return <LoadingSpinner message="Đang tải dữ liệu nguy cơ lũ lụt..." />;
  }

  // Lọc dữ liệu theo risk level nếu có
  const filteredData = selectedRisk
    ? floodRiskData.filter(item => item.risk_level === selectedRisk)
    : floodRiskData;

  // Tìm location hiện tại trong flood risk data
  const currentLocationRisk = location?.location_id
    ? floodRiskData.find(item => item.location_id === location.location_id)
    : null;

  // Đếm số lượng theo risk level
  const riskCounts = floodRiskData.reduce((acc, item) => {
    acc[item.risk_level] = (acc[item.risk_level] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const getRiskColor = (riskLevel: string): string => {
    switch (riskLevel) {
      case 'NONE':
        return COLORS.success;
      case 'LOW':
        return COLORS.warning;
      case 'MEDIUM':
        return COLORS.alertModerate;
      case 'HIGH':
        return COLORS.alertSevere;
      case 'EXTREME':
        return COLORS.alertExtreme;
      default:
        return COLORS.textSecondary;
    }
  };

  const getRiskLabel = (riskLevel: string): string => {
    switch (riskLevel) {
      case 'NONE':
        return 'Không có nguy cơ';
      case 'LOW':
        return 'Nguy cơ thấp';
      case 'MEDIUM':
        return 'Nguy cơ trung bình';
      case 'HIGH':
        return 'Nguy cơ cao';
      case 'EXTREME':
        return 'Nguy cơ cực cao';
      default:
        return riskLevel;
    }
  };

  // Lấy tên địa điểm từ location_id hoặc tọa độ
  const getLocationName = (item: FloodRiskData): string => {
    if (!provincesLoaded) {
      return `${item.lat.toFixed(1)}, ${item.lon.toFixed(1)}`;
    }
    
    // Thử tìm theo location_id trước
    const provinceById = getProvinceByLocationId(item.location_id);
    if (provinceById) {
      return provinceById.nameEn;
    }
    
    // Nếu không tìm thấy, tìm theo tọa độ
    const provinceByCoords = getProvinceByCoordinates(item.lat, item.lon);
    if (provinceByCoords) {
      return provinceByCoords.nameEn;
    }
    
    // Fallback về tọa độ nếu không tìm thấy
    return `${item.lat.toFixed(1)}, ${item.lon.toFixed(1)}`;
  };

  const renderRiskItem = ({item}: {item: FloodRiskData}) => {
    const riskColor = getRiskColor(item.risk_level);
    const isCurrentLocation = item.location_id === location?.location_id;
    const locationName = getLocationName(item);

    return (
      <View style={[styles.riskCard, isCurrentLocation && styles.riskCardCurrent]}>
        <View style={styles.riskHeader}>
          <View style={styles.locationInfo}>
            <Text style={styles.locationName}>
              {locationName}
            </Text>
            <Text style={styles.locationCoords}>
              {item.lat.toFixed(4)}, {item.lon.toFixed(4)}
            </Text>
            {isCurrentLocation && (
              <View style={styles.currentBadge}>
                <Text style={styles.currentBadgeText}>📍 Vị trí hiện tại</Text>
              </View>
            )}
          </View>
          <View style={[styles.riskBadge, {backgroundColor: riskColor + '20', borderColor: riskColor}]}>
            <Text style={[styles.riskBadgeText, {color: riskColor}]}>
              {getRiskLabel(item.risk_level)}
            </Text>
          </View>
        </View>

        <View style={styles.riskDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Điểm nguy cơ</Text>
            <Text style={styles.detailValue}>{item.risk_score}</Text>
          </View>
          
          <View style={styles.divider} />
          
          <View style={styles.rainSection}>
            <Text style={styles.sectionTitle}>Lượng mưa</Text>
            <View style={styles.rainGrid}>
              <View style={styles.rainItem}>
                <Text style={styles.rainLabel}>1 giờ</Text>
                <Text style={styles.rainValue}>{item.rain_1h_mm.toFixed(1)} mm</Text>
              </View>
              <View style={styles.rainItem}>
                <Text style={styles.rainLabel}>3 giờ</Text>
                <Text style={styles.rainValue}>{item.rain_3h_mm.toFixed(1)} mm</Text>
              </View>
              <View style={styles.rainItem}>
                <Text style={styles.rainLabel}>Hiệu quả 1h</Text>
                <Text style={styles.rainValue}>{item.eff_rain_1h_mm.toFixed(1)} mm</Text>
              </View>
              <View style={styles.rainItem}>
                <Text style={styles.rainLabel}>Hiệu quả 3h</Text>
                <Text style={styles.rainValue}>{item.eff_rain_3h_mm.toFixed(1)} mm</Text>
              </View>
            </View>
          </View>

          {item.relief_m !== null && (
            <>
              <View style={styles.divider} />
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Độ cao địa hình</Text>
                <Text style={styles.detailValue}>{item.relief_m.toFixed(1)} m</Text>
              </View>
            </>
          )}

          <View style={styles.divider} />
          <Text style={styles.timeText}>
            Cập nhật: {new Date(item.valid_at).toLocaleString('vi-VN')}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Nguy cơ lũ lụt</Text>
        <Text style={styles.subtitle}>
          {floodRiskData.length} vị trí được giám sát
        </Text>
      </View>

      {/* Current location risk summary */}
      {currentLocationRisk && (
        <View style={[styles.summaryCard, {borderColor: getRiskColor(currentLocationRisk.risk_level)}]}>
          <Text style={styles.summaryTitle}>📍 Vị trí của bạn</Text>
          <View style={styles.summaryContent}>
            <View style={[styles.summaryBadge, {backgroundColor: getRiskColor(currentLocationRisk.risk_level) + '20'}]}>
              <Text style={[styles.summaryBadgeText, {color: getRiskColor(currentLocationRisk.risk_level)}]}>
                {getRiskLabel(currentLocationRisk.risk_level)}
              </Text>
            </View>
            <Text style={styles.summaryScore}>Điểm: {currentLocationRisk.risk_score}</Text>
            <Text style={styles.summaryRain}>
              Mưa 1h: {currentLocationRisk.rain_1h_mm.toFixed(1)}mm • 3h: {currentLocationRisk.rain_3h_mm.toFixed(1)}mm
            </Text>
          </View>
        </View>
      )}

      {/* Risk level overview cards - horizontal scroll */}
      <View style={styles.riskOverviewSection}>
        <Text style={styles.sectionHeader}>Mức độ nguy cơ</Text>
        <ScrollView 
          horizontal 
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.riskCardsContainer}>
          {/* Tất cả card */}
          <TouchableOpacity
            style={[
              styles.riskLevelCard,
              {borderColor: COLORS.primary},
              !selectedRisk && styles.riskLevelCardActive,
              !selectedRisk && {backgroundColor: COLORS.primary + '15'},
            ]}
            onPress={() => setSelectedRisk(null)}>
            <View style={[styles.riskLevelIcon, {backgroundColor: COLORS.primary + '20'}]}>
              <Text style={[styles.riskLevelIconText, {color: COLORS.primary}]}>
                📍
              </Text>
            </View>
            <Text style={[styles.riskLevelLabel, {color: COLORS.primary}]}>
              Tất cả
            </Text>
            <Text style={styles.riskLevelCount}>{floodRiskData.length} vị trí</Text>
          </TouchableOpacity>

          {['NONE', 'LOW', 'MEDIUM', 'HIGH', 'EXTREME'].map(riskLevel => {
            const count = riskCounts[riskLevel] || 0;
            const riskColor = getRiskColor(riskLevel);
            const isSelected = selectedRisk === riskLevel;
            
            return (
              <TouchableOpacity
                key={riskLevel}
                style={[
                  styles.riskLevelCard,
                  {borderColor: riskColor},
                  isSelected && styles.riskLevelCardActive,
                  isSelected && {backgroundColor: riskColor + '15'},
                ]}
                onPress={() => setSelectedRisk(isSelected ? null : riskLevel)}>
                <View style={[styles.riskLevelIcon, {backgroundColor: riskColor + '20'}]}>
                  <Text style={[styles.riskLevelIconText, {color: riskColor}]}>
                    {riskLevel === 'NONE' ? '✓' : riskLevel === 'LOW' ? '⚠' : riskLevel === 'MEDIUM' ? '⚡' : riskLevel === 'HIGH' ? '🔥' : '🚨'}
                  </Text>
                </View>
                <Text style={[styles.riskLevelLabel, {color: riskColor}]}>
                  {getRiskLabel(riskLevel)}
                </Text>
                <Text style={styles.riskLevelCount}>{count} vị trí</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* Risk list */}
      <FlatList
        data={filteredData}
        renderItem={renderRiskItem}
        keyExtractor={item => item.location_id}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>Không có dữ liệu</Text>
          </View>
        }
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: SPACING.md,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.md,
  },
  title: {
    fontSize: FONT_SIZE.xxxl,
    color: COLORS.text,
    fontWeight: '800',
    letterSpacing: -1,
    marginBottom: SPACING.xs,
  },
  subtitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  summaryCard: {
    backgroundColor: COLORS.cardBackground,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    borderWidth: 2,
    shadowColor: COLORS.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  summaryTitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    fontWeight: '700',
    marginBottom: SPACING.sm,
  },
  summaryContent: {
    gap: SPACING.xs,
  },
  summaryBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    marginBottom: SPACING.xs,
  },
  summaryBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  summaryScore: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    fontWeight: '600',
  },
  summaryRain: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
  },
  riskOverviewSection: {
    marginBottom: SPACING.md,
  },
  sectionHeader: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.text,
    fontWeight: '700',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  riskCardsContainer: {
    paddingHorizontal: SPACING.md,
    gap: SPACING.md,
    paddingBottom: SPACING.xs,
  },
  riskLevelCard: {
    width: 140,
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.md,
    borderWidth: 2,
    alignItems: 'center',
    shadowColor: COLORS.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  riskLevelCardActive: {
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 5,
  },
  riskLevelIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING.sm,
  },
  riskLevelIconText: {
    fontSize: 28,
  },
  riskLevelLabel: {
    fontSize: FONT_SIZE.md,
    fontWeight: '700',
    marginBottom: SPACING.xs,
    textAlign: 'center',
  },
  riskLevelCount: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  filtersContainer: {
    marginBottom: SPACING.md,
    zIndex: 1,
    minHeight: 60,
  },
  filtersContent: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
    gap: SPACING.md,
    alignItems: 'center',
  },
  filterButton: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.md,
    backgroundColor: COLORS.cardBackground,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  filterButtonActive: {
    backgroundColor: COLORS.primary + '10',
    borderColor: COLORS.primary,
    borderWidth: 2,
  },
  filterText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  filterTextActive: {
    color: COLORS.primary,
    fontWeight: '700',
  },
  listContent: {
    paddingBottom: SPACING.xl,
  },
  riskCard: {
    backgroundColor: COLORS.cardBackground,
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.md,
    padding: SPACING.md,
    borderRadius: BORDER_RADIUS.xl,
    shadowColor: COLORS.shadow,
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  riskCardCurrent: {
    borderColor: COLORS.primary,
    borderWidth: 2,
    shadowColor: COLORS.shadowPrimary,
    shadowOpacity: 0.2,
  },
  riskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING.md,
  },
  locationInfo: {
    flex: 1,
  },
  locationName: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    fontWeight: '700',
    marginBottom: SPACING.xs / 2,
  },
  locationCoords: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontWeight: '500',
    marginBottom: SPACING.xs,
  },
  currentBadge: {
    backgroundColor: COLORS.primary + '20',
    paddingHorizontal: SPACING.sm,
    paddingVertical: 2,
    borderRadius: BORDER_RADIUS.sm,
    alignSelf: 'flex-start',
  },
  currentBadgeText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.primary,
    fontWeight: '600',
  },
  riskBadge: {
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.xs,
    borderRadius: BORDER_RADIUS.md,
    borderWidth: 1,
  },
  riskBadgeText: {
    fontSize: FONT_SIZE.sm,
    fontWeight: '700',
  },
  riskDetails: {
    gap: SPACING.xs,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    fontWeight: '500',
  },
  detailValue: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    fontWeight: '700',
  },
  divider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: SPACING.xs,
  },
  rainSection: {
    marginTop: SPACING.xs,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    fontWeight: '600',
    marginBottom: SPACING.sm,
  },
  rainGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING.sm,
  },
  rainItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: COLORS.background,
    padding: SPACING.sm,
    borderRadius: BORDER_RADIUS.sm,
    alignItems: 'center',
  },
  rainLabel: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    marginBottom: SPACING.xs,
  },
  rainValue: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    fontWeight: '700',
  },
  timeText: {
    fontSize: FONT_SIZE.xs,
    color: COLORS.textSecondary,
    fontStyle: 'italic',
  },
  emptyContainer: {
    padding: SPACING.xl,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
  },
});

