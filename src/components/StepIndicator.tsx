import React from 'react';
import { View, Text, StyleSheet, useColorScheme, TouchableOpacity } from 'react-native';
import { Colors, Spacing, BorderRadius } from '../constants/theme';

interface StepIndicatorProps {
  currentStep: number;
  steps: string[];
  onStepPress?: (step: number) => void;
}

export default function StepIndicator({ currentStep, steps, onStepPress }: StepIndicatorProps) {
  const scheme = useColorScheme();
  const themeColors = Colors[scheme === 'dark' ? 'dark' : 'light'];

  return (
    <View style={styles.container}>
      {steps.map((step, index) => {
        const stepNum = index + 1;
        const isActive = stepNum === currentStep;
        const isCompleted = stepNum < currentStep;

        return (
          <React.Fragment key={index}>
            {/* Step Circle & Label */}
            <TouchableOpacity 
              style={styles.stepWrapper}
              activeOpacity={0.7}
              onPress={() => {
                if (onStepPress) {
                  onStepPress(stepNum);
                }
              }}
              disabled={!onStepPress}
            >
              <View
                style={[
                  styles.circle,
                  {
                    backgroundColor: isCompleted
                      ? themeColors.success
                      : isActive
                      ? themeColors.accent
                      : themeColors.backgroundElement,
                    borderColor: isActive || isCompleted ? 'transparent' : themeColors.border,
                    borderWidth: 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.stepNumber,
                    {
                      color: isActive || isCompleted ? '#ffffff' : themeColors.textSecondary,
                    },
                  ]}
                >
                  {stepNum}
                </Text>
              </View>
              <Text
                style={[
                  styles.label,
                  {
                    color: isActive ? themeColors.text : themeColors.textSecondary,
                    fontWeight: isActive ? '700' : '500',
                  },
                ]}
              >
                {step}
              </Text>
            </TouchableOpacity>

            {/* Connecting Line (except for last step) */}
            {index < steps.length - 1 && (
              <View
                style={[
                  styles.line,
                  {
                    backgroundColor:
                      stepNum < currentStep ? themeColors.success : themeColors.border,
                  },
                ]}
              />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingVertical: Spacing.two,
    marginBottom: Spacing.three,
  },
  stepWrapper: {
    alignItems: 'center',
    zIndex: 1,
  },
  circle: {
    width: 32,
    height: 32,
    borderRadius: BorderRadius.pill,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  stepNumber: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  label: {
    fontSize: 10,
    marginTop: 4,
    textAlign: 'center',
  },
  line: {
    flex: 1,
    height: 2,
    marginHorizontal: -Spacing.one,
    marginTop: -14, // Alinear con el centro del círculo
  },
});
