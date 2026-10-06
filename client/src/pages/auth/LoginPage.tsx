import * as React from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Eye, EyeOff, ArrowRight, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { FormField } from '@/components/ui/form-field';
import { Logo } from '@/components/brand/Logo';
import { HOME } from '@/components/ProtectedRoute';
import { getErrorMessage } from '@/lib/axios';

export function LoginPage() {
  const { login, user, isLoading } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = React.useState('');
  const [password, setPassword] = React.useState('');
  const [submitting, setSubmitting] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);

  React.useEffect(() => {
    if (!isLoading && user) navigate(HOME, { replace: true });
  }, [user, isLoading, navigate]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      navigate(HOME, { replace: true });
    } catch (err) {
      toast.error(getErrorMessage(err, 'Invalid email or password'));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-sunrise px-4 py-10">
      <div className="relative w-full max-w-sm">
        <div className="mb-9 flex flex-col items-center text-center">
          <Logo size={92} variant="mark" elevated className="mb-5" />
          <h1 className="text-2xl font-extrabold uppercase tracking-[0.05em] text-foreground">The Solar Coop</h1>
          <p className="mt-1.5 text-sm font-medium text-muted-foreground">Complaint &amp; Service Management</p>
        </div>

        <form
          onSubmit={onSubmit}
          className="space-y-5 rounded-3xl border border-border/60 bg-card/90 p-7 shadow-warm-lg backdrop-blur-sm"
        >
          <FormField label="Email" htmlFor="email" required>
            <Input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="you@solarcoop.dev"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </FormField>

          <FormField label="Password" htmlFor="password" required>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                placeholder="••••••••"
                className="pr-12"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-1 top-1/2 -translate-y-1/2 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="h-[1.1rem] w-[1.1rem]" /> : <Eye className="h-[1.1rem] w-[1.1rem]" />}
              </button>
            </div>
          </FormField>

          <Button type="submit" className="group w-full" size="lg" loading={submitting}>
            {!submitting && (
              <>
                Sign in
                <ArrowRight className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </>
            )}
          </Button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          <ShieldCheck className="mr-1 inline h-3.5 w-3.5 -translate-y-px text-success" />
          Ask your administrator if you've forgotten your password.
        </p>
      </div>
    </div>
  );
}
