import { ArrowLeft } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';

import { dashboardReturnTo } from '../utils/dashboardReturn';

interface ProductDetailBackButtonProps {
  onClick?: () => void;
  to?: string;
  localOnly?: boolean;
}

export function ProductDetailBackButton({ onClick, to, localOnly = false }: ProductDetailBackButtonProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const handleClick = () => {
    const dashboard = !localOnly && dashboardReturnTo(location.search, location.state);
    if (dashboard) {
      navigate(dashboard);
    } else if (onClick) {
      onClick();
    } else if (to) {
      navigate(to);
    } else {
      navigate(-1);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className="approval-back-btn"
      aria-label="Orqaga"
    >
      <span className="approval-back-btn__icon" aria-hidden>
        <ArrowLeft className="w-4 h-4" strokeWidth={2} />
      </span>
      <span>Orqaga</span>
    </button>
  );
}
