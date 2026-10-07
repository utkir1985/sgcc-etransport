import { useState, useEffect } from 'react';
import {
  TrainFront, Eye, EyeOff, Loader2,
  FileText, ShieldCheck, Clock, Calendar,
  User, Lock, ArrowRight, Building2,
} from 'lucide-react';
import { useAuth } from '../../../shared/contexts/AuthContext';

const UZ_MONTHS = [
  'yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun',
  'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr',
];

const FEATURES = [
  {
    icon: FileText,
    iconClass: 'login-feat-icon--blue',
    title: 'Elektron hujjat aylanishi',
    desc: 'Qog‘ozbozliksiz buyurtmalar, shartnomalar, dalolatnomalar va QR-kodli elektron yuk xatlari.',
  },
  {
    icon: TrainFront,
    iconClass: 'login-feat-icon--cyan',
    title: 'Transport va vagonlar monitoringi',
    desc: 'Korxona hududidagi transport vositalarining holati: kirish nazoratidan tortib, yuklash va jo‘natilishgacha.',
  },
  {
    icon: ShieldCheck,
    iconClass: 'login-feat-icon--emerald',
    title: 'Xavfsizlik va Shaffof audit',
    desc: 'Har bir tarozi o‘lchovi, muhr/plombalar hisobi va tizimdagi barcha harakatlarning to‘liq qayd etilishi.',
  },
];

export default function LoginPage() {
  const { login } = useAuth();

  const [username, setUsername] = useState(() => localStorage.getItem('etransport_saved_login') || '');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(() => Boolean(localStorage.getItem('etransport_saved_login')));
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Jonli soat va sana
  const [currentDateTime, setCurrentDateTime] = useState(() => new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentDateTime(new Date());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('dark');
    return () => {
      const saved = localStorage.getItem('etransport_theme');
      if (saved === 'dark') document.documentElement.classList.add('dark');
    };
  }, []);

  const formattedDate = `${currentDateTime.getDate()}-${UZ_MONTHS[currentDateTime.getMonth()]}, ${currentDateTime.getFullYear()}`;
  const formattedTime = currentDateTime.toLocaleTimeString('ru-RU', {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const cleanUsername = username.trim();

    if (rememberMe) {
      localStorage.setItem('etransport_saved_login', cleanUsername);
    } else {
      localStorage.removeItem('etransport_saved_login');
    }

    try {
      await login(cleanUsername, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login yoki parol noto\'g\'ri');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      {/* Realistik temir yo'l kechki terminal foni */}
      <div className="login-bg-photo" aria-hidden="true" />
      <div className="login-bg-vignette" aria-hidden="true" />

      {/* Asosiy konteyner */}
      <div className="login-container">
        {/* Yuqori Panel: Brend logotipi va jonli soat/sana */}
        <header className="login-header">
          <div className="login-topbar-brand">
            <div className="login-topbar-icon">
              <TrainFront className="w-5 h-5 text-white" strokeWidth={2.2} />
            </div>
            <span className="login-topbar-title">E-Transport</span>
          </div>

          <div className="login-topbar-meta">
            <div className="login-meta-item">
              <Calendar className="w-4 h-4 text-slate-400" />
              <span>{formattedDate}</span>
            </div>
            <div className="login-meta-item">
              <Clock className="w-4 h-4 text-slate-400" />
              <span className="font-mono font-medium">{formattedTime}</span>
            </div>
          </div>
        </header>

        {/* Markaziy qism: Chapda ma'lumotlar, O'ngda kirish kartasi */}
        <main className="login-main">
          {/* Chap Blok: Sarlavha, 3 ta to'liq qatorli karta, 3 ta KPI */}
          <section className="login-hero-section">
            <div className="login-hero-pill" aria-hidden="true" />

            <h1 className="login-hero-title">
              E-Transport{' '}
              <span className="login-hero-accent">tizimi</span>
            </h1>

            <h2 className="login-hero-subtitle">
              Yuklash logistikasining yagona raqamli ekotizimi
            </h2>

            <p className="login-hero-desc">
              Mahsulot yuklash, elektron hujjat aylanishi va transport harakatini real
              vaqt rejimida nazorat qiling.
            </p>

            {/* 3 ta Imkoniyat Kartasi (1-rasmdagidek) */}
            <div className="login-features-stack">
              {FEATURES.map(({ icon: Icon, iconClass, title, desc }) => (
                <div key={title} className="login-feature-card-row">
                  <div className={`login-feature-icon-box ${iconClass}`}>
                    <Icon className="w-5 h-5" strokeWidth={2} />
                  </div>
                  <div className="login-feature-card-text">
                    <h3 className="login-feature-card-title">{title}</h3>
                    <p className="login-feature-card-desc">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* O'ng Blok: Shishasimon (Glassmorphism) Kirish Kartasi */}
          <aside className="login-card-aside">
            <div className="login-glass-card">
              {/* Karta tepasidagi logotip */}
              <div className="login-card-badge-header">
                <div className="login-card-badge-icon">
                  <TrainFront className="w-8 h-8 text-white" strokeWidth={2} />
                </div>
                <h2 className="login-card-brand-title">E-Transport</h2>
                <p className="login-card-brand-sub">Tizimga kirish</p>
              </div>


              {/* Forma */}
              <form onSubmit={handleSubmit} className="login-form">
                <div className="login-field-wrap">
                  <div className="login-field-input-box">
                    <User className="login-field-icon" strokeWidth={1.8} />
                    <input
                      type="text"
                      value={username}
                      onChange={e => setUsername(e.target.value)}
                      className="login-text-input"
                      placeholder="Login kiriting"
                      required
                      autoComplete="username"
                    />
                  </div>
                </div>

                <div className="login-field-wrap">
                  <div className="login-field-input-box">
                    <Lock className="login-field-icon" strokeWidth={1.8} />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      className="login-text-input login-text-input--password"
                      placeholder="Parol kiriting"
                      required
                      autoComplete="current-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="login-pw-toggle"
                      aria-label={showPassword ? 'Parolni yashirish' : 'Parolni ko\'rsatish'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Meni eslab qolish */}
                <div className="login-remember-wrap">
                  <label className="login-remember-label">
                    <input
                      type="checkbox"
                      checked={rememberMe}
                      onChange={e => setRememberMe(e.target.checked)}
                      className="login-remember-checkbox"
                    />
                    <span className="login-remember-text">Meni eslab qolish</span>
                  </label>
                </div>

                {error && (
                  <div className="login-error-badge">{error}</div>
                )}

                {/* Kirish tugmasi */}
                <button
                  type="submit"
                  disabled={loading}
                  className="login-action-button"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Tekshirilmoqda...</span>
                    </>
                  ) : (
                    <>
                      <span>Kirish</span>
                      <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" strokeWidth={2.2} />
                    </>
                  )}
                </button>
              </form>
            </div>
          </aside>
        </main>

        {/* Pastki Panel: Mualliflik huquqi va shior */}
        <footer className="login-footer">
          <div className="login-footer-copy">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <span>© 2026 E-Transport. Barcha huquqlar himoyalangan.</span>
          </div>
          <div className="login-footer-slogan">
            <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
            <span>Yuk harakati — yurt taraqqiyoti!</span>
          </div>
        </footer>
      </div>
    </div>
  );
}
