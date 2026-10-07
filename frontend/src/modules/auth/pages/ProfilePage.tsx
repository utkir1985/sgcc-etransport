import { useNavigate } from 'react-router-dom';
import { ProfileEditModal } from '../../../shared/components/ProfileEditModal';

/** Deep-link: /profile → modal, yopilganda orqaga. */
export default function ProfilePage() {
  const navigate = useNavigate();
  return (
    <ProfileEditModal
      open
      onClose={() => {
        if (window.history.length > 1) navigate(-1);
        else navigate('/dashboard', { replace: true });
      }}
    />
  );
}
