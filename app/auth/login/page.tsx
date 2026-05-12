import LoginForm from './LoginForm';

export const metadata = {
  title: 'Sign In — Arrowhead 7',
  description: 'Sign in to your Arrowhead 7 account.',
};

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string; next?: string };
}) {
  return <LoginForm error={searchParams.error} message={searchParams.message} next={searchParams.next} />;
}
