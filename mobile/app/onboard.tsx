import { useRouter } from 'expo-router';
import { OnboardingFlow } from '../src/components/OnboardingFlow';

export default function OnboardScreen() {
  const router = useRouter();
  // Full screen, without the scrolling Screen frame: each step is a page of
  // its own, with its own progress bar and buttons.
  return <OnboardingFlow onComplete={() => router.replace('/')} />;
}
