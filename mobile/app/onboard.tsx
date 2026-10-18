import { useRouter } from 'expo-router';
import { Screen } from '../src/components/Screen';
import { OnboardingWizard } from '../src/components/OnboardingWizard';

export default function OnboardScreen() {
  const router = useRouter();
  return (
    <Screen>
      <OnboardingWizard onComplete={() => router.replace('/')} />
    </Screen>
  );
}
