import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { radius, space, useTheme } from '../theme';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'subtle' | 'danger';
  disabled?: boolean;
}

export const Button = ({ label, onPress, variant = 'primary', disabled }: ButtonProps) => {
  const { colors } = useTheme();
  const background =
    variant === 'primary' ? colors.accent : variant === 'danger' ? colors.danger : colors.surfaceRaised;
  const textColor = variant === 'subtle' ? colors.text : '#FFFFFF';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: background, opacity: disabled ? 0.4 : pressed ? 0.75 : 1 },
      ]}
    >
      <Text style={[styles.buttonLabel, { color: textColor }]}>{label}</Text>
    </Pressable>
  );
};

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  suffix?: string;
  keyboardType?: KeyboardTypeOptions;
  placeholder?: string;
  hint?: string;
  /** Called when the field loses focus, for values that should not commit per keystroke. */
  onBlurCommit?: () => void;
}

export const Field = ({
  label,
  value,
  onChangeText,
  suffix,
  keyboardType = 'default',
  placeholder,
  hint,
  onBlurCommit,
}: FieldProps) => {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <View
        style={[styles.inputRow, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}
      >
        <TextInput
          value={value}
          onChangeText={onChangeText}
          onBlur={onBlurCommit}
          keyboardType={keyboardType}
          placeholder={placeholder}
          placeholderTextColor={colors.textFaint}
          // The visible label lives in a sibling Text, so without this the
          // input is announced as unlabelled and the hint never reaches a
          // screen reader.
          accessibilityLabel={label}
          accessibilityHint={hint}
          style={[styles.input, { color: colors.text }]}
        />
        {suffix && <Text style={[styles.suffix, { color: colors.textFaint }]}>{suffix}</Text>}
      </View>
      {hint && <Text style={[styles.hint, { color: colors.textFaint }]}>{hint}</Text>}
    </View>
  );
};

interface SegmentedProps<T extends string> {
  label?: string;
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}

export const Segmented = <T extends string>({ label, options, value, onChange }: SegmentedProps<T>) => {
  const { colors } = useTheme();
  return (
    <View style={styles.field}>
      {label && <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>}
      <View style={[styles.segment, { backgroundColor: colors.surfaceRaised, borderColor: colors.border }]}>
        {options.map((option) => {
          const active = option.value === value;
          return (
            <Pressable
              key={option.value}
              onPress={() => onChange(option.value)}
              style={[
                styles.segmentItem,
                active && { backgroundColor: colors.accent },
              ]}
            >
              <Text
                style={[
                  styles.segmentLabel,
                  { color: active ? '#FFFFFF' : colors.textMuted },
                ]}
                numberOfLines={1}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  button: {
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
  },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  field: { gap: space.xs, marginBottom: space.md },
  fieldLabel: { fontSize: 11, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
  },
  input: { flex: 1, paddingVertical: space.md, fontSize: 16 },
  suffix: { fontSize: 13, marginLeft: space.sm },
  hint: { fontSize: 11, marginTop: 2 },
  segment: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 3,
  },
  segmentItem: {
    flex: 1,
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentLabel: { fontSize: 13, fontWeight: '600' },
});
