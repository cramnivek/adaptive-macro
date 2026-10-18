import { useEffect, useState } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { type ConfirmRequest, subscribeToConfirm } from '../dialog';
import { thud } from '../platform/haptics';
import { font, radius, space, useTheme } from '../theme';

export const ConfirmDialog = () => {
  const { colors } = useTheme();
  const [request, setRequest] = useState<ConfirmRequest | null>(null);

  useEffect(() => {
    return subscribeToConfirm(setRequest);
  }, []);

  if (!request) {
    return null;
  }

  const handleConfirm = () => {
    thud('heavy');
    const resolve = request.resolve;
    setRequest(null);
    resolve(true);
  };

  const handleCancel = () => {
    thud('light');
    const resolve = request.resolve;
    setRequest(null);
    resolve(false);
  };

  const isDestructive = request.destructive ?? false;

  return (
    <Modal
      visible={true}
      transparent={true}
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <Pressable style={styles.backdrop} onPress={handleCancel}>
        <Pressable
          style={[
            styles.dialogCard,
            {
              backgroundColor: colors.surface,
              borderColor: isDestructive ? `${colors.danger}66` : colors.border,
            },
          ]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header Icon + Title */}
          <View style={styles.header}>
            <View
              style={[
                styles.iconBubble,
                {
                  backgroundColor: isDestructive
                    ? `${colors.danger}22`
                    : colors.surfaceRaised,
                  borderColor: isDestructive
                    ? `${colors.danger}55`
                    : colors.border,
                },
              ]}
            >
              <Ionicons
                name={isDestructive ? 'alert-circle' : 'help-circle'}
                size={22}
                color={isDestructive ? colors.danger : colors.accent}
              />
            </View>

            <View style={styles.titleCol}>
              <Text style={[styles.title, { color: colors.text }]}>
                {request.title}
              </Text>
            </View>
          </View>

          {/* Body Message */}
          {Boolean(request.message) && (
            <Text style={[styles.message, { color: colors.textMuted }]}>
              {request.message}
            </Text>
          )}

          {/* Actions */}
          <View style={styles.actionsRow}>
            <Pressable
              onPress={handleCancel}
              style={({ pressed }) => [
                styles.button,
                styles.cancelButton,
                {
                  backgroundColor: colors.surfaceRaised,
                  borderColor: colors.border,
                  opacity: pressed ? 0.75 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={request.cancelLabel ?? 'Cancel'}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>
                {request.cancelLabel ?? 'Cancel'}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleConfirm}
              style={({ pressed }) => [
                styles.button,
                styles.confirmButton,
                {
                  backgroundColor: isDestructive ? colors.danger : colors.accent,
                  opacity: pressed ? 0.85 : 1,
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={request.confirmLabel ?? 'OK'}
            >
              <Text
                style={[
                  styles.buttonText,
                  styles.confirmButtonText,
                  { color: isDestructive ? '#FFFFFF' : colors.onFill },
                ]}
              >
                {request.confirmLabel ?? 'OK'}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: space.lg,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: radius['2xl'],
    borderWidth: 1.5,
    padding: space.xl,
    gap: space.md,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 24,
    elevation: 16,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  iconBubble: {
    width: 44,
    height: 44,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleCol: {
    flex: 1,
  },
  title: {
    fontFamily: font.uiStrong,
    fontSize: 16,
    lineHeight: 22,
  },
  message: {
    fontFamily: font.ui,
    fontSize: 13,
    lineHeight: 19,
  },
  actionsRow: {
    flexDirection: 'row',
    gap: space.sm,
    marginTop: space.xs,
  },
  button: {
    flex: 1,
    minHeight: 46,
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.md,
  },
  cancelButton: {
    borderWidth: StyleSheet.hairlineWidth,
  },
  confirmButton: {},
  buttonText: {
    fontFamily: font.uiStrong,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  confirmButtonText: {
    fontWeight: '700',
  },
});
