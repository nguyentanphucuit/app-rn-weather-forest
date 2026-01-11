import React from 'react';
import {View, Text, StyleSheet, ScrollView, TouchableOpacity} from 'react-native';
import {useAlerts} from '../providers/AlertProvider';
import {AlertCard} from '../components/AlertCard';
import {LoadingSpinner} from '../components/LoadingSpinner';
import {COLORS} from '../utils/colors';
import {SPACING, FONT_SIZE, BORDER_RADIUS} from '../utils/constants';

export const AlertsScreen: React.FC = () => {
  const {alerts, activeAlerts, loading, refreshAlerts, dismissAlert} = useAlerts();

  if (loading) {
    return <LoadingSpinner message="Đang tải cảnh báo lũ lụt..." />;
  }

  const allAlerts = activeAlerts.length > 0 ? activeAlerts : alerts;

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <View style={styles.header}>
        <Text style={styles.title}>Cảnh báo lũ lụt</Text>
        <TouchableOpacity onPress={refreshAlerts} style={styles.refreshButton}>
          <Text style={styles.refreshButtonText}>🔄 Làm mới</Text>
        </TouchableOpacity>
      </View>

      {allAlerts.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={styles.emptyTitle}>Không có cảnh báo</Text>
          <Text style={styles.emptyText}>
            Hiện tại không có cảnh báo lũ lụt nào cho các khu vực được giám sát.
          </Text>
        </View>
      ) : (
        <View style={styles.alertsList}>
          <Text style={styles.sectionTitle}>
            {activeAlerts.length > 0
              ? `${activeAlerts.length} Cảnh báo đang hoạt động`
              : 'Tất cả cảnh báo'}
          </Text>
          {allAlerts.map(alert => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onDismiss={() => dismissAlert(alert.id)}
            />
          ))}
        </View>
      )}

      {alerts.length > 0 && (
        <View style={styles.infoSection}>
          <Text style={styles.infoTitle}>Về cảnh báo lũ lụt</Text>
          <Text style={styles.infoText}>
            Cảnh báo lũ lụt được phát hành dựa trên dữ liệu mưa và độ cao địa hình để cảnh báo bạn về
            nguy cơ lũ lụt tại các khu vực được giám sát. Hãy chú ý đến các cảnh báo nghiêm trọng và cực đoan,
            và thực hiện các biện pháp phòng ngừa thích hợp khi có nguy cơ lũ lụt.
          </Text>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  contentContainer: {
    paddingBottom: SPACING.xl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginHorizontal: SPACING.md,
    marginTop: SPACING.md,
    marginBottom: SPACING.sm,
  },
  title: {
    fontSize: FONT_SIZE.xxxl,
    color: COLORS.text,
    fontWeight: '800',
    letterSpacing: -1,
  },
  refreshButton: {
    paddingHorizontal: SPACING.lg,
    paddingVertical: SPACING.sm,
    borderRadius: BORDER_RADIUS.lg,
    backgroundColor: COLORS.primary,
    shadowColor: COLORS.shadowPrimary,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  refreshButtonText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: SPACING.xl,
    marginTop: SPACING.xxl,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: SPACING.md,
  },
  emptyTitle: {
    fontSize: FONT_SIZE.xl,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  emptyText: {
    fontSize: FONT_SIZE.md,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  alertsList: {
    marginTop: SPACING.sm,
  },
  sectionTitle: {
    fontSize: FONT_SIZE.lg,
    color: COLORS.text,
    fontWeight: '600',
    marginHorizontal: SPACING.md,
    marginBottom: SPACING.sm,
  },
  infoSection: {
    backgroundColor: COLORS.cardBackground,
    borderRadius: BORDER_RADIUS.xl,
    padding: SPACING.lg,
    marginHorizontal: SPACING.md,
    marginTop: SPACING.lg,
    shadowColor: COLORS.shadow,
    shadowOffset: {width: 0, height: 4},
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 5,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  infoTitle: {
    fontSize: FONT_SIZE.md,
    color: COLORS.text,
    fontWeight: '600',
    marginBottom: SPACING.xs,
  },
  infoText: {
    fontSize: FONT_SIZE.sm,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
});

