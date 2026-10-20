import { useState } from 'react';
import { FyMark, Wordmark } from '../components/Brand';
import { Button } from '../components/ui';
import { auth, errorMessage } from '../lib/api';
import { FARGUSGRAM_URL } from '../config';

// Mesma conta do FargusGram (quem já entrou lá, entra aqui direto)
export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await auth.signIn(email, password);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="auth">
      <div className="auth__card">
        <div className="auth__brand">
          <FyMark size={64} />
          <Wordmark big />
          <p className="muted">A trilha sonora dos personagens de Fargus</p>
        </div>
        <form onSubmit={submit} className="form">
          <input className="input" type="email" autoComplete="email" autoCapitalize="none" placeholder="E-mail do FargusGram" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <input className="input" type="password" autoComplete="current-password" placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} required />
          {error && <p className="form-error">{error}</p>}
          <Button type="submit" loading={busy} disabled={!email || !password} className="btn--block">
            Entrar
          </Button>
        </form>
        <p className="auth__hint muted">
          Use a mesma conta do <a href={FARGUSGRAM_URL}>FargusGram</a>. Ainda não tem? Crie lá com o código de convite.
        </p>
      </div>
    </div>
  );
}
