/**
 * ============================================================================
 * Authentication Components - Login & Register UI
 * ============================================================================
 * 
 * These components handle user authentication flow.
 * CRITICAL FOR DATA ISOLATION:
 * - Login/Register validates credentials with Supabase Auth
 * - Creates secure session with unique user ID
 * - Session must be validated before accessing any data
 */

import React, { useState } from 'react';
import { useSession } from '../contexts/SessionContext';
import { LogIn, UserPlus, AlertCircle, Loader2, ChefHat } from 'lucide-react';

interface AuthPageProps {
  onAuthSuccess: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onAuthSuccess }) => {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  
  const { login, register } = useSession();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setLocalError(null);

    try {
      if (isLogin) {
        // CRITICAL: Login creates secure session with user ID
        await login(email, password);
      } else {
        // CRITICAL: Register creates new user and session
        await register(email, password);
      }

      // Success - navigate to main app
      onAuthSuccess();
    } catch (err: any) {
      setLocalError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-3xl p-10 shadow-2xl">
          {/* Header */}
          <div className="flex items-center justify-center mb-8">
            <div className="bg-indigo-100 w-16 h-16 rounded-3xl flex items-center justify-center text-indigo-600">
              <ChefHat size={40} />
            </div>
          </div>

          <h1 className="text-3xl font-black text-center mb-2">Sensory Lab</h1>
          <p className="text-center text-slate-600 mb-8">
            {isLogin ? 'Access your sensory testing panel' : 'Create a new account'}
          </p>

          {/* Error Message */}
          {localError && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg flex gap-3">
              <AlertCircle className="text-red-600 flex-shrink-0" size={20} />
              <p className="text-red-700 text-sm">{localError}</p>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4 mb-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="your@email.com"
                required
                disabled={loading}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                disabled={loading}
                className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-lg outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-3 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
            >
              {loading ? (
                <>
                  <Loader2 size={20} className="animate-spin" />
                  {isLogin ? 'Signing in...' : 'Creating account...'}
                </>
              ) : (
                <>
                  {isLogin ? (
                    <>
                      <LogIn size={20} />
                      Sign In
                    </>
                  ) : (
                    <>
                      <UserPlus size={20} />
                      Create Account
                    </>
                  )}
                </>
              )}
            </button>
          </form>

          {/* Toggle Auth Mode */}
          <div className="text-center">
            <p className="text-slate-600 text-sm">
              {isLogin ? "Don't have an account? " : 'Already have an account? '}
              <button
                onClick={() => {
                  setIsLogin(!isLogin);
                  setLocalError(null);
                  setEmail('');
                  setPassword('');
                }}
                disabled={loading}
                className="text-indigo-600 font-semibold hover:underline disabled:opacity-50"
              >
                {isLogin ? 'Sign up' : 'Sign in'}
              </button>
            </p>
          </div>

          {/* Security Info */}
          <div className="mt-8 p-4 bg-indigo-50 rounded-lg">
            <p className="text-xs text-indigo-700 leading-relaxed">
              <strong>🔒 Secure:</strong> Your data is encrypted and isolated. Each user's data is completely separate and invisible to other users.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
