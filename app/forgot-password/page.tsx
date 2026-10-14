import { AuthCard } from '../../components/auth-card';
import { AuthForm } from '../../components/auth-form';
export default function ForgotPassword() { return <AuthCard title="Reset your password" description="We’ll send a secure link to your staff email."><AuthForm mode="reset" /></AuthCard>; }
