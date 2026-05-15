import LoginForm from './LoginForm';

export const metadata = {
  title: 'Sign In — Arrowhead 7',
  description: 'Sign in to your Arrowhead 7 account.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
}) {
  const sp = await searchParams;
  return <LoginForm error={sp.error} message={sp.message} next={sp.next} />;
}
