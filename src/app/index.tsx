import { Redirect } from 'expo-router';

import { useSession } from '@/lib/session';

export default function Index() {
  const { session, loading } = useSession();

  if (loading) {
    return null;
  }

  return <Redirect href={session ? '/(tabs)/home' : '/login'} />;
}
