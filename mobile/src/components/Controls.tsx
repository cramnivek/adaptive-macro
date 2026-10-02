import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';
import { font, radius, space, useTheme } from '../theme';
import { session as loud } from '../theme/sessionTheme';
import { SlashPanel } from './SlashPanel';
import { Tappable } from './Tappable';

interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'subtle' | 'danger';
  disabled?: boolean;
  /** Draws on the training side's palette, so its primary action is the red. */
  tone?: 'loud';
}

export const Button = ({ label, onPress, variant = 'primary', disabled, tone }: ButtonProps) => {
  const { colors } = useTheme();
  const isLoud = tone === 'loud';
  const background = isLoud
    ? variant === 'primary'
      ? loud.loud
      : variant === 'danger'
        ? colors.danger
        : loud.panel
    : variant === 'primary'
      ? colors.accent
      : variant === 'danger'
        ? colors.danger
        : colors.surfaceRaised;
  const textColor = isLoud
    ? variant === 'subtle'
      ? loud.figure
      : loud.onLoud
    : variant === 'subtle'
      ? colors.text
      : colors.onFill;

  return (
    // `Tappable` rather than `Pressable`: the press used to register only as a
    // drop in opacity, which on a filled slab is barely visible. It sinks now.
    //
    // A primary action leans; everything else stays square. The lean is the
    // app's one piece of shared visual language, and spending it on the single
    // action a screen most wants you to take is what makes it mean anything —
    // a screen where Cancel leans as hard as Save says nothing at all.
    <Tappable onPress={onPress} disabled={disabled} style={{ opacity: disabled ? 0.4 : 1 }}>
      {variant === 'primary' ? (
        <SlashPanel color={background} style={styles.button}>
          <Text style={[styles.buttonLabel, { color: textColor }]}>{label}</Text>
        </SlashPanel>
      ) : (
        <View style={[styles.button, styles.squared, { backgroundColor: background }]}>
          <Text style={[styles.buttonLabel, { color: textColor }]}>{label}</Text>
        </View>
      )}
    </Tappable>
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
  /**
   * Grows the field to several lines. Worth it for anything a phone user is
   * likely to dictate rather than type — a one-line box hides most of a spoken
   * sentence behind a scroll.
   */
  multiline?: boolean;
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
  multiline = false,
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
          multiline={multiline}
          numberOfLines={multiline ? 3 : 1}
          textAlignVertical={multiline ? 'top' : 'center'}
          style={[styles.input, multiline && styles.inputMultiline, { color: colors.text }]}
        />
        {suffix && <Text style={[styles.suffix, { color: colors.textFaint }]}>{suffix}</Text>}
      </View>
      {hint && <Text style={[styles.hint, { color: colors.textFaint }]}>{hint}</Text>}
    </View>
  );
};

interface StepperProps {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  suffix?: string;
  hint?: string;
  /**
   * Fixed increment. Omit to size the step from the current value, which is
   * what you want for portions: 5 g steps around a 60 g slice of bread are
   * useful, the same steps around a 400 g plate are tedious.
   */
  step?: number;
  min?: number;
}

/** Chooses a step that suits the magnitude being edited. */
const stepFor = (value: number): number => {
  const magnitude = Math.abs(value);
  if (magnitude < 20) return 1;
  if (magnitude < 100) return 5;
  if (magnitude < 500) return 10;
  return 25;
};

/**
 * A number you can adjust without opening the keyboard.
 *
 * Typing a three-digit gram amount on a phone means summoning a keypad that
 * covers half the screen, for a value usually within one or two steps of what
 * is already there. The field still accepts typing for the cases where that is
 * genuinely faster.
 */
export const Stepper = ({
  label,
  value,
  onChangeText,
  suffix,
  hint,
  step,
  min = 0,
}: StepperProps) => {
  const { colors } = useTheme();
  const parsed = Number.parseFloat(value.replace(',', '.'));
  const current = Number.isFinite(parsed) ? parsed : 0;
  const increment = step ?? stepFor(current);

  const nudge = (direction: 1 | -1) => {
    const next = Math.max(min, current + direction * increment);
    // Trailing floating-point noise would show as 82.30000000000001.
    onChangeText(String(Math.round(next * 100) / 100));
  };

  return (
    <View style={styles.field}>
      <Text style={[styles.fieldLabel, { color: colors.textMuted }]}>{label}</Text>
      <View style={styles.stepperRow}>
        <Pressable
          onPress={() => nudge(-1)}
          accessibilityLabel={`Decrease ${label} by ${increment}`}
          style={({ pressed }) => [
            styles.stepperButton,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text style={[styles.stepperGlyph, { color: colors.text }]}>−</Text>
        </Pressable>

        <View
          style={[
            styles.stepperValue,
            { backgroundColor: colors.surfaceRaised, borderColor: colors.border },
          ]}
        >
          <TextInput
            value={value}
            onChangeText={onChangeText}
            keyboardType="decimal-pad"
            accessibilityLabel={label}
            accessibilityHint={hint}
            selectTextOnFocus
            style={[styles.stepperInput, { color: colors.text }]}
          />
          {suffix && <Text style={[styles.suffix, { color: colors.textFaint }]}>{suffix}</Text>}
        </View>

        <Pressable
          onPress={() => nudge(1)}
          accessibilityLabel={`Increase ${label} by ${increment}`}
          style={({ pressed }) => [
            styles.stepperButton,
            {
              backgroundColor: colors.surfaceRaised,
              borderColor: colors.border,
              opacity: pressed ? 0.6 : 1,
            },
          ]}
        >
          <Text style={[styles.stepperGlyph, { color: colors.text }]}>+</Text>
        </Pressable>
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
                  { color: active ? colors.onFill : colors.textMuted },
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

/**
 * Minimum comfortable touch target. Apple and Google both land near this;
 * anything smaller gets mis-tapped by a thumb, which is how most of this app
 * will be used.
 */
export const TOUCH_TARGET = 44;

const styles = StyleSheet.create({
  // No corner radius here: the leaning primary gets its shape from the skew,
  // and a rounded rectangle behind a sheared one shows at the corners.
  button: {
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  squared: { borderRadius: radius.md },
  buttonLabel: { fontFamily: font.uiStrong, fontSize: 15 },
  field: { gap: space.xs, marginBottom: space.md },
  fieldLabel: { fontFamily: font.uiStrong, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
  },
  input: { fontFamily: font.ui, flex: 1, paddingVertical: space.md, fontSize: 16, minHeight: TOUCH_TARGET },
  inputMultiline: { minHeight: TOUCH_TARGET * 2, paddingTop: space.md },
  suffix: { fontFamily: font.ui, fontSize: 13, marginLeft: space.sm },
  hint: { fontFamily: font.ui, fontSize: 11, marginTop: 2 },
  segment: {
    flexDirection: 'row',
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 3,
    gap: 3,
  },
  stepperRow: { flexDirection: 'row', alignItems: 'stretch', gap: space.sm },
  stepperButton: {
    width: TOUCH_TARGET + 8,
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperGlyph: { fontFamily: font.uiStrong, fontSize: 22, lineHeight: 26 },
  stepperValue: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: TOUCH_TARGET,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: space.md,
  },
  stepperInput: { fontFamily: font.figure, flex: 1, fontSize: 18, textAlign: 'center' },
  segmentItem: {
    flex: 1,
    minHeight: TOUCH_TARGET,
    justifyContent: 'center',
    paddingVertical: space.sm,
    paddingHorizontal: space.xs,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentLabel: { fontFamily: font.uiStrong, fontSize: 13 },
});
