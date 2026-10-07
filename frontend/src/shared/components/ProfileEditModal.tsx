import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Eye,
  EyeOff,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { api } from '../services/api';

interface ProfileEditModalProps {
  open: boolean;
  onClose: () => void;
}

export function ProfileEditModal({ open, onClose }: ProfileEditModalProps) {
  const { user, refreshProfile } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);

  const [fullName, setFullName] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [removeAvatar, setRemoveAvatar] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setFullName(user?.fullName || '');
    setAvatarPreview(user?.avatarUrl || '');
    setPendingFile(null);
    setRemoveAvatar(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setError('');
    setShowNew(false);
    setShowConfirm(false);
    setShowCurrent(false);
  }, [open, user?.fullName, user?.avatarUrl]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) onClose();
    }
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, saving, onClose]);

  if (!open) return null;

  const initials = (user?.fullName || user?.username || 'U').charAt(0).toUpperCase();
  const changingPassword = newPassword.trim().length > 0 || confirmPassword.trim().length > 0;

  const onPickFile = (file: File | null) => {
    if (!file) return;
    if (file.size > 300 * 1024) {
      setError('Rasm 300 KB dan oshmasin');
      return;
    }
    setError('');
    setPendingFile(file);
    setRemoveAvatar(false);
    const url = URL.createObjectURL(file);
    setAvatarPreview(url);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const name = fullName.trim();
    if (name.length < 2) {
      setError('Ism va familiyani kiriting');
      return;
    }

    if (changingPassword) {
      if (!currentPassword.trim()) {
        setError('Parolni o‘zgartirish uchun joriy parolni kiriting');
        return;
      }
      if (newPassword.length < 6) {
        setError('Yangi parol kamida 6 belgi bo‘lsin');
        return;
      }
      if (newPassword !== confirmPassword) {
        setError('Yangi parol tasdiqlanmadi');
        return;
      }
    }

    setSaving(true);
    try {
      if (name !== (user?.fullName || '').trim()) {
        await api.updateOwnProfile({ fullName: name });
      }
      if (pendingFile) {
        await api.uploadOwnAvatar(pendingFile);
      } else if (removeAvatar) {
        await api.uploadOwnAvatar(null);
      }
      if (changingPassword) {
        await api.changeOwnPassword({
          currentPassword,
          newPassword,
        });
      }
      await refreshProfile();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Saqlashda xatolik');
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="confirm-dialog-root" role="presentation">
      <button
        type="button"
        className="confirm-dialog-backdrop"
        aria-label="Yopish"
        disabled={saving}
        onClick={() => { if (!saving) onClose(); }}
      />
      <div className="profile-modal" role="dialog" aria-modal="true" aria-labelledby="profile-modal-title">
        <div className="profile-modal__head">
          <h2 id="profile-modal-title">Profilni tahrirlash</h2>
          <button
            type="button"
            className="profile-modal__close"
            aria-label="Yopish"
            disabled={saving}
            onClick={onClose}
          >
            <X className="size-4" strokeWidth={1.75} />
          </button>
        </div>

        <form className="profile-modal__body" onSubmit={handleSave}>
          <div className="profile-modal__avatar-row">
            <div className="profile-modal__avatar">
              {avatarPreview ? (
                <img src={avatarPreview} alt="" />
              ) : (
                <span>{initials}</span>
              )}
            </div>
            <div className="profile-modal__avatar-side">
              <button
                type="button"
                className="profile-modal__upload"
                disabled={saving}
                onClick={() => fileRef.current?.click()}
              >
                <Upload className="size-4" strokeWidth={1.75} />
                Rasm yuklash
              </button>
              <p className="profile-modal__hint">JPEG, PNG, WEBP yoki GIF, 300 KB gacha</p>
              {(avatarPreview || user?.avatarUrl) && !removeAvatar ? (
                <button
                  type="button"
                  className="profile-modal__link"
                  disabled={saving}
                  onClick={() => {
                    setPendingFile(null);
                    setRemoveAvatar(true);
                    setAvatarPreview('');
                  }}
                >
                  Rasmni olib tashlash
                </button>
              ) : null}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              className="hidden"
              onChange={e => onPickFile(e.target.files?.[0] ?? null)}
            />
          </div>

          <label className="profile-modal__field">
            <span>
              Ism va familiya <em>*</em>
            </span>
            <input
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="Ism va familiya"
              autoComplete="name"
              required
            />
          </label>

          {changingPassword ? (
            <label className="profile-modal__field">
              <span>
                Joriy parol <em>*</em>
              </span>
              <div className="profile-modal__pass">
                <input
                  type={showCurrent ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={e => setCurrentPassword(e.target.value)}
                  autoComplete="current-password"
                  placeholder="Joriy parolingiz"
                />
                <button type="button" onClick={() => setShowCurrent(v => !v)} aria-label="Ko‘rsatish">
                  {showCurrent ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>
          ) : null}

          <div className="profile-modal__pass-grid">
            <label className="profile-modal__field">
              <span>Yangi parol</span>
              <div className="profile-modal__pass">
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="O‘zgartirmoqchi bo‘lsangiz kiriting"
                />
                <button type="button" onClick={() => setShowNew(v => !v)} aria-label="Ko‘rsatish">
                  {showNew ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>
            <label className="profile-modal__field">
              <span>Yangi parolni tasdiqlash</span>
              <div className="profile-modal__pass">
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Yangi parolni qayta kiriting"
                />
                <button type="button" onClick={() => setShowConfirm(v => !v)} aria-label="Ko‘rsatish">
                  {showConfirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </label>
          </div>

          {error ? <p className="profile-modal__error">{error}</p> : null}

          <div className="profile-modal__actions">
            <button
              type="button"
              className="profile-modal__btn profile-modal__btn--ghost"
              disabled={saving}
              onClick={onClose}
            >
              Bekor qilish
            </button>
            <button type="submit" className="profile-modal__btn profile-modal__btn--primary" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : null}
              Saqlash
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
